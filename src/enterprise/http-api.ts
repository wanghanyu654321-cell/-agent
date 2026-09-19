import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import type { WeComKfClient } from "../channels/wecom/client.ts";
import type { WeComCallbackVerifier, WeComKfMessageEvent } from "../channels/wecom/crypto.ts";
import type { VerifiedWeComCustomerText, WeComCustomerRouter } from "../channels/wecom/customer.ts";
import type { SupportRuntimePort } from "../http-api.ts";
import type { SupportResult } from "../index.ts";
import {
	boundedId,
	parseAvailabilityWrite,
	parseBookingCreate,
	parseBookingTransition,
	StoreOpsError,
	validateDate,
} from "../storeops/contracts.ts";
import type { StoreOpsService } from "../storeops/postgres.ts";
import type { EnterpriseAuthService } from "./auth.ts";
import {
	EnterpriseConversationConflictError,
	EnterpriseConversationNotFoundError,
	type EnterpriseSupportPort,
	type PersistentAuditEventRecord,
	runtimeRequest,
} from "./business.ts";
import type { SupportExecutionContext } from "./identity.ts";

const BODY_LIMIT_BYTES = 64 * 1024;
const SESSION_COOKIE = "support_session";

export interface EnterpriseHttpServerOptions {
	auth: EnterpriseAuthService;
	wecomCallbackVerifier?: WeComCallbackVerifier;
	wecomKfClient?: WeComKfClient;
	wecomCustomerRouter?: WeComCustomerRouter;
	runtime?: SupportRuntimePort;
	supportService?: EnterpriseSupportPort;
	storeOpsService?: Pick<
		StoreOpsService,
		| "listAvailability"
		| "putAvailability"
		| "listBookingIntents"
		| "createBookingIntent"
		| "transitionBookingIntent"
		| "listNeedsAttention"
	>;
	storeOpsKnowledge?: (context: SupportExecutionContext) => Promise<{
		items: {
			id: string;
			kind: "faq" | "policy" | "sop" | "reference";
			title: string;
			version: string;
			sourceRef: string;
			updatedAt: string;
			status: "approved";
		}[];
	}>;
	secureCookies?: boolean;
	staticRoot?: string;
}

export function createEnterpriseHttpServer(options: EnterpriseHttpServerOptions): Server {
	return createServer((request, response) => {
		void handleRequest(request, response, options);
	});
}

async function handleRequest(
	request: IncomingMessage,
	response: ServerResponse,
	options: EnterpriseHttpServerOptions,
): Promise<void> {
	const url = new URL(request.url ?? "/", "http://localhost");
	const path = url.pathname;
	try {
		if (path === "/api/v1/channels/wecom/callback") {
			if (request.method === "GET") return weComCallbackVerification(response, options, url);
			if (request.method === "POST") return await weComCallbackEvent(request, response, options, url);
			return sendJson(response, 405, { error: "method_not_allowed" }, { Allow: "GET, POST" });
		}
		if (path === "/api/v1/storeops" || path.startsWith("/api/v1/storeops/"))
			return await storeOps(request, response, options, url);
		if (path === "/healthz")
			return request.method === "GET"
				? sendJson(response, 200, { status: "ok" })
				: methodNotAllowed(response, "GET");
		if (path === "/api/v1/auth/login")
			return request.method === "POST" ? login(request, response, options) : methodNotAllowed(response, "POST");
		if (path === "/api/v1/auth/logout")
			return request.method === "POST" ? logout(request, response, options) : methodNotAllowed(response, "POST");
		if (path === "/api/v1/auth/me")
			return request.method === "GET" ? me(request, response, options) : methodNotAllowed(response, "GET");
		if (path === "/api/v1/support/respond")
			return request.method === "POST" ? support(request, response, options) : methodNotAllowed(response, "POST");
		if (path === "/api/v1/conversations")
			return request.method === "GET"
				? readBusiness(
						request,
						response,
						options,
						url,
						"conversation:read",
						(context) => options.supportService?.listConversations(context) ?? Promise.resolve([]),
					)
				: methodNotAllowed(response, "GET");
		if (path === "/api/v1/tickets")
			return request.method === "GET"
				? readBusiness(
						request,
						response,
						options,
						url,
						"conversation:read",
						(context) => options.supportService?.listTickets(context) ?? Promise.resolve([]),
					)
				: methodNotAllowed(response, "GET");
		if (path === "/api/v1/handoffs")
			return request.method === "GET"
				? readBusiness(
						request,
						response,
						options,
						url,
						"conversation:read",
						(context) => options.supportService?.listHandoffs(context) ?? Promise.resolve([]),
					)
				: methodNotAllowed(response, "GET");
		if (path === "/api/v1/audit-events")
			return request.method === "GET"
				? readBusiness(request, response, options, url, "audit:read", async (context) =>
						options.supportService
							? (await options.supportService.listAuditEvents(context)).map(publicAuditEvent)
							: [],
					)
				: methodNotAllowed(response, "GET");
		if (path.startsWith("/api/")) return sendJson(response, 404, { error: "not_found" });
		if (options.staticRoot && (await serveStaticFile(path, response, options.staticRoot))) return;
		return sendJson(response, 404, { error: "not_found" });
	} catch (error) {
		if (error instanceof StoreOpsError) {
			const status = {
				invalid_request: 400,
				forbidden: 403,
				not_found: 404,
				availability_conflict: 409,
				booking_intent_conflict: 409,
				dependency_unavailable: 503,
			}[error.code];
			return sendJson(response, status, { error: error.code });
		}
		if (error instanceof EnterpriseConversationNotFoundError) return sendJson(response, 404, { error: "not_found" });
		if (error instanceof EnterpriseConversationConflictError)
			return sendJson(response, 409, { error: "conversation_conflict" });
		return sendJson(response, 500, { error: "internal_error" });
	}
}

function weComCallbackVerification(response: ServerResponse, options: EnterpriseHttpServerOptions, url: URL): void {
	const verifier = options.wecomCallbackVerifier;
	if (!verifier) {
		sendJson(response, 503, { error: "dependency_unavailable" });
		return;
	}
	try {
		sendText(response, 200, verifier.verifyUrl(url));
	} catch {
		sendJson(response, 400, { error: "invalid_request" });
	}
}

async function weComCallbackEvent(
	request: IncomingMessage,
	response: ServerResponse,
	options: EnterpriseHttpServerOptions,
	url: URL,
): Promise<void> {
	const verifier = options.wecomCallbackVerifier;
	if (!verifier) return sendJson(response, 503, { error: "dependency_unavailable" });
	let event: WeComKfMessageEvent;
	try {
		event = verifier.verifyEvent(url, await readTextBody(request));
	} catch {
		return sendJson(response, 400, { error: "invalid_request" });
	}
	const client = options.wecomKfClient;
	const customerRouter = options.wecomCustomerRouter;
	const supportService = options.supportService;
	if (!client || !customerRouter || !supportService)
		return sendJson(response, 503, { error: "dependency_unavailable" });
	try {
		const synced = await client.syncMessages(event);
		const routed = await routeWeComCustomerTexts(customerRouter, supportService, synced.textMessages);
		console.info(
			JSON.stringify({
				event: "wecom_kf_sync",
				messageCount: synced.messageCount,
				textCount: synced.textMessages.length,
				hasMore: synced.hasMore,
				...routed,
			}),
		);
		return sendText(response, 200, "success");
	} catch {
		return sendJson(response, 502, { error: "dependency_unavailable" });
	}
}

async function routeWeComCustomerTexts(
	customerRouter: WeComCustomerRouter,
	supportService: Pick<EnterpriseSupportPort, "respond">,
	messages: readonly VerifiedWeComCustomerText[],
): Promise<{
	claimed: number;
	duplicates: number;
	conflicts: number;
	routed: number;
	completed: number;
	unbound: number;
	routeAttachFailed: number;
	routingErrors: number;
	executionErrors: number;
	completionPersistFailed: number;
}> {
	let claimed = 0;
	let duplicates = 0;
	let conflicts = 0;
	let routed = 0;
	let completed = 0;
	let unbound = 0;
	let routeAttachFailed = 0;
	let routingErrors = 0;
	let executionErrors = 0;
	let completionPersistFailed = 0;
	for (const message of messages) {
		const requestId = randomUUID();
		const claim = await customerRouter.claim(message, requestId);
		if (claim.status === "duplicate") {
			duplicates += 1;
			continue;
		}
		if (claim.status === "conflict") {
			conflicts += 1;
			continue;
		}
		claimed += 1;
		let route;
		try {
			route = await customerRouter.resolveRoute(message, requestId);
			if (!route) {
				await customerRouter.markFailed(claim.id, "unbound_channel");
				unbound += 1;
				continue;
			}
			if (!(await customerRouter.attachRoute(claim.id, route))) {
				await customerRouter.markFailed(claim.id, "route_attach_failed");
				routeAttachFailed += 1;
				continue;
			}
			routed += 1;
		} catch {
			await customerRouter.markFailed(claim.id, "routing_error").catch(() => false);
			routingErrors += 1;
			continue;
		}
		let result: SupportResult;
		try {
			result = await supportService.respond(route.context, {
				conversationId: route.conversationId,
				customerId: route.customerId,
				text: message.text,
			});
		} catch {
			await customerRouter.markFailed(claim.id, "agent_execution_error").catch(() => false);
			executionErrors += 1;
			continue;
		}
		try {
			if (!(await customerRouter.complete(claim.id, result.type))) {
				await customerRouter.markFailed(claim.id, "completion_persist_failed").catch(() => false);
				completionPersistFailed += 1;
				continue;
			}
			completed += 1;
		} catch {
			await customerRouter.markFailed(claim.id, "completion_persist_failed").catch(() => false);
			completionPersistFailed += 1;
		}
	}
	return {
		claimed,
		duplicates,
		conflicts,
		routed,
		completed,
		unbound,
		routeAttachFailed,
		routingErrors,
		executionErrors,
		completionPersistFailed,
	};
}

async function readTextBody(request: IncomingMessage): Promise<string> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += buffer.byteLength;
		if (size > BODY_LIMIT_BYTES) throw new Error("Request body too large.");
		chunks.push(buffer);
	}
	return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
}

async function storeOps(
	request: IncomingMessage,
	response: ServerResponse,
	options: EnterpriseHttpServerOptions,
	url: URL,
): Promise<void> {
	const context = await authenticatedContext(request, options.auth);
	if (!context) return sendJson(response, 401, { error: "unauthenticated" });
	const path = url.pathname.slice("/api/v1/storeops".length);
	const availability = /^\/availability\/([^/]+)\/([^/]+)$/.exec(path);
	const transition = /^\/booking-intents\/([^/]+)\/transition$/.exec(path);
	const methods =
		path === "/booking-intents"
			? ["GET", "POST"]
			: availability
				? ["PUT"]
				: transition
					? ["POST"]
					: ["/availability", "/knowledge", "/needs-attention"].includes(path)
						? ["GET"]
						: [];
	if (!methods.length) throw new StoreOpsError("not_found");
	if (!methods.includes(request.method ?? ""))
		return sendJson(response, 405, { error: "method_not_allowed" }, { Allow: methods.join(", ") });
	if (
		[...url.searchParams.keys()].some((key) => key !== "date" || path !== "/availability") ||
		url.searchParams.getAll("date").length > 1
	)
		throw new StoreOpsError("invalid_request");
	if (request.method !== "GET" && request.headers.origin !== undefined) {
		let origin: URL;
		try {
			origin = new URL(request.headers.origin);
		} catch {
			throw new StoreOpsError("forbidden");
		}
		const protocol = options.secureCookies ? "https:" : "http:";
		if (origin.origin !== `${protocol}//${request.headers.host}` || origin.href !== `${origin.origin}/`)
			throw new StoreOpsError("forbidden");
	}
	const capability =
		request.method === "GET" ? "storeops:read" : availability ? "availability:write" : "booking-intent:create";
	if (!transition && !context.actor.capabilities.includes(capability)) throw new StoreOpsError("forbidden");
	if (path === "/needs-attention" && context.actor.role === "agent") throw new StoreOpsError("forbidden");
	if (path === "/knowledge") {
		if (!options.storeOpsKnowledge) throw new StoreOpsError("dependency_unavailable");
		return sendJson(response, 200, await options.storeOpsKnowledge(context));
	}
	const service = options.storeOpsService;
	if (!service) throw new StoreOpsError("dependency_unavailable");
	if (request.method === "GET") {
		const result =
			path === "/availability"
				? await service.listAvailability(context, validateDate(url.searchParams.get("date")))
				: path === "/booking-intents"
					? await service.listBookingIntents(context)
					: await service.listNeedsAttention(context);
		return sendJson(response, 200, result);
	}
	let body: Record<string, unknown>;
	try {
		body = await readJsonBody(request);
	} catch {
		throw new StoreOpsError("invalid_request");
	}
	const decodeId = (value: string) => {
		try {
			return boundedId(decodeURIComponent(value));
		} catch {
			throw new StoreOpsError("invalid_request");
		}
	};
	if (availability) {
		const date = decodeId(availability[2]!);
		return sendJson(
			response,
			200,
			await service.putAvailability(context, decodeId(availability[1]!), date, parseAvailabilityWrite(date, body)),
		);
	}
	if (transition) {
		const input = parseBookingTransition(body);
		if (
			!context.actor.capabilities.includes(
				input.action === "cancel" ? "booking-intent:create" : "booking-intent:manage",
			)
		)
			throw new StoreOpsError("forbidden");
		return sendJson(response, 200, await service.transitionBookingIntent(context, decodeId(transition[1]!), input));
	}
	const result = await service.createBookingIntent(
		context,
		boundedId(request.headers["idempotency-key"]),
		parseBookingCreate(body),
	);
	return sendJson(response, result.duplicate ? 200 : 201, result.intent);
}

async function login(
	request: IncomingMessage,
	response: ServerResponse,
	options: EnterpriseHttpServerOptions,
): Promise<void> {
	const body = await readJsonBody(request);
	const email = requiredString(body, "email");
	const password = requiredString(body, "password");
	const authenticated = await options.auth.login(email, password);
	if (!authenticated) return sendJson(response, 401, { error: "invalid_credentials" });
	return sendJson(
		response,
		200,
		{ expiresAt: authenticated.expiresAt.toISOString() },
		{ "Set-Cookie": sessionCookie(authenticated.token, authenticated.expiresAt, options.secureCookies ?? false) },
	);
}

async function logout(
	request: IncomingMessage,
	response: ServerResponse,
	options: EnterpriseHttpServerOptions,
): Promise<void> {
	await options.auth.logout(readCookie(request, SESSION_COOKIE));
	response.writeHead(204, { "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
	response.end();
}

async function me(
	request: IncomingMessage,
	response: ServerResponse,
	options: EnterpriseHttpServerOptions,
): Promise<void> {
	const context = await authenticatedContext(request, options.auth);
	if (!context) return sendJson(response, 401, { error: "unauthenticated" });
	return sendJson(response, 200, context);
}

async function support(
	request: IncomingMessage,
	response: ServerResponse,
	options: EnterpriseHttpServerOptions,
): Promise<void> {
	const requestId = randomUUID();
	response.setHeader("X-Request-Id", requestId);
	const context = await authenticatedContext(request, options.auth, requestId);
	if (!context) return sendJson(response, 401, { error: "unauthenticated" });
	if (!context.actor.capabilities.includes("agent:invoke")) return sendJson(response, 403, { error: "forbidden" });
	const body = await readJsonBody(request);
	const input = {
		conversationId: requiredString(body, "conversationId"),
		customerId: requiredString(body, "customerId"),
		text: requiredString(body, "text"),
	};
	const result = options.supportService
		? await options.supportService.respond(context, input)
		: await requireRuntime(options).run(runtimeRequest(input, context));
	return sendJson(response, 200, publicSupportResult(result));
}

async function readBusiness(
	request: IncomingMessage,
	response: ServerResponse,
	options: EnterpriseHttpServerOptions,
	url: URL,
	requiredCapability: "conversation:read" | "audit:read",
	list: (context: SupportExecutionContext) => Promise<unknown>,
): Promise<void> {
	if (url.searchParams.has("tenantId") || url.searchParams.has("storeId")) {
		return sendJson(response, 400, { error: "invalid_scope_query" });
	}
	const context = await authenticatedContext(request, options.auth);
	if (!context) return sendJson(response, 401, { error: "unauthenticated" });
	if (!context.actor.capabilities.includes(requiredCapability)) return sendJson(response, 403, { error: "forbidden" });
	if (!options.supportService) return sendJson(response, 404, { error: "not_found" });
	return sendJson(response, 200, await list(context));
}

async function authenticatedContext(
	request: IncomingMessage,
	auth: EnterpriseAuthService,
	requestId = randomUUID(),
): Promise<SupportExecutionContext | undefined> {
	return auth.resolveExecutionContext(readCookie(request, SESSION_COOKIE), requestId);
}

function requireRuntime(options: EnterpriseHttpServerOptions): SupportRuntimePort {
	if (!options.runtime) throw new Error("Enterprise support runtime is not configured.");
	return options.runtime;
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += buffer.byteLength;
		if (size > BODY_LIMIT_BYTES) throw new Error("Request body too large.");
		chunks.push(buffer);
	}
	const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid request body.");
	return parsed as Record<string, unknown>;
}

function requiredString(body: Record<string, unknown>, field: string): string {
	const value = body[field];
	if (typeof value !== "string" || value.trim().length === 0) throw new Error(`Invalid ${field}.`);
	return value;
}

function readCookie(request: IncomingMessage, name: string): string | undefined {
	const header = request.headers.cookie;
	if (!header) return undefined;
	return header
		.split(";")
		.map((item) => item.trim())
		.find((item) => item.startsWith(`${name}=`))
		?.slice(name.length + 1);
}

function sessionCookie(token: string, expiresAt: Date, secure: boolean): string {
	return [
		`${SESSION_COOKIE}=${token}`,
		"HttpOnly",
		"SameSite=Strict",
		"Path=/",
		`Max-Age=${Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))}`,
		`Expires=${expiresAt.toUTCString()}`,
		...(secure ? ["Secure"] : []),
	].join("; ");
}

function publicSupportResult(result: SupportResult): Omit<SupportResult, "sessionEvents"> {
	return {
		type: result.type,
		text: result.text,
		piSessionId: result.piSessionId,
		toolsCalled: result.toolsCalled,
		evidence: result.evidence,
	};
}

type PublicAuditEvent = {
	id: string;
	tenantId: string;
	storeId: string;
	conversationId: string;
	eventType: "support-agent.audit";
	outcome?: "answer" | "fallback" | "escalation";
	toolsCalled: Array<"search_faq" | "search_knowledge" | "create_ticket" | "handoff_to_human">;
	requestId?: string;
	runtimeDurationMs?: number;
	agentProfileId?: string;
	agentProfileVersion?: string;
	agentProfileHash?: string;
	createdAt: string;
};

const publicAuditTools = ["search_faq", "search_knowledge", "create_ticket", "handoff_to_human"] as const;
const publicAuditOutcomes = ["answer", "fallback", "escalation"] as const;

function publicAuditEvent(event: PersistentAuditEventRecord): PublicAuditEvent {
	const payload = event.payload;
	const outcome = publicAuditOutcomes.includes(payload.outcome as (typeof publicAuditOutcomes)[number])
		? (payload.outcome as PublicAuditEvent["outcome"])
		: undefined;
	const toolsCalled = Array.isArray(payload.toolsCalled)
		? payload.toolsCalled.filter(
				(tool): tool is PublicAuditEvent["toolsCalled"][number] =>
					typeof tool === "string" && publicAuditTools.includes(tool as PublicAuditEvent["toolsCalled"][number]),
			)
		: [];
	const requestId =
		typeof payload.requestId === "string" && payload.requestId.trim().length > 0 ? payload.requestId : undefined;
	const runtimeDurationMs =
		typeof payload.runtimeDurationMs === "number" &&
		Number.isFinite(payload.runtimeDurationMs) &&
		payload.runtimeDurationMs >= 0
			? payload.runtimeDurationMs
			: undefined;
	const agentProfileId = nonEmptyAuditText(payload.agentProfileId);
	const agentProfileVersion = nonEmptyAuditText(payload.agentProfileVersion);
	const agentProfileHash =
		typeof payload.agentProfileHash === "string" && /^[a-f0-9]{64}$/.test(payload.agentProfileHash)
			? payload.agentProfileHash
			: undefined;
	return {
		id: event.id,
		tenantId: event.tenantId,
		storeId: event.storeId,
		conversationId: event.conversationId,
		eventType: "support-agent.audit",
		...(outcome ? { outcome } : {}),
		toolsCalled,
		...(requestId ? { requestId } : {}),
		...(runtimeDurationMs !== undefined ? { runtimeDurationMs } : {}),
		...(agentProfileId ? { agentProfileId } : {}),
		...(agentProfileVersion ? { agentProfileVersion } : {}),
		...(agentProfileHash ? { agentProfileHash } : {}),
		createdAt: event.createdAt.toISOString(),
	};
}

function nonEmptyAuditText(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function methodNotAllowed(response: ServerResponse, method: "GET" | "POST"): void {
	sendJson(response, 405, { error: "method_not_allowed" }, { Allow: method });
}

async function serveStaticFile(pathname: string, response: ServerResponse, staticRoot: string): Promise<boolean> {
	const relativePath = staticRelativePath(pathname);
	if (!relativePath) return false;
	const root = resolve(staticRoot);
	const filePath = resolve(root, relativePath);
	if (!filePath.startsWith(`${root}${sep}`)) return false;
	const file = await stat(filePath).catch(() => undefined);
	if (!file?.isFile()) return false;
	const body = await readFile(filePath);
	response.writeHead(200, { "content-type": staticContentType(filePath), "content-length": String(body.byteLength) });
	response.end(body);
	return true;
}

function staticRelativePath(pathname: string): string | undefined {
	try {
		const decoded = decodeURIComponent(pathname);
		if (decoded.includes("\0")) return undefined;
		const stripped = decoded.replace(/^\/+/, "");
		return stripped || "index.html";
	} catch {
		return undefined;
	}
}

function staticContentType(filePath: string): string {
	switch (extname(filePath).toLowerCase()) {
		case ".html":
			return "text/html; charset=utf-8";
		case ".js":
		case ".mjs":
			return "text/javascript; charset=utf-8";
		case ".css":
			return "text/css; charset=utf-8";
		case ".svg":
			return "image/svg+xml";
		case ".json":
			return "application/json; charset=utf-8";
		case ".png":
			return "image/png";
		case ".jpg":
		case ".jpeg":
			return "image/jpeg";
		case ".ico":
			return "image/x-icon";
		case ".woff2":
			return "font/woff2";
		default:
			return "application/octet-stream";
	}
}

function sendText(response: ServerResponse, status: number, body: string): void {
	const encoded = Buffer.from(body, "utf8");
	response.writeHead(status, {
		"content-type": "text/plain; charset=utf-8",
		"content-length": String(encoded.byteLength),
		"cache-control": "no-store",
	});
	response.end(encoded);
}

function sendJson(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
	response.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
	response.end(JSON.stringify(body));
}
