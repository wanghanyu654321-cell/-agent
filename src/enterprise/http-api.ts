import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import type { SupportRuntimePort } from "../http-api.ts";
import type { SupportResult } from "../index.ts";
import type { EnterpriseAuthService } from "./auth.ts";
import {
	EnterpriseConversationConflictError,
	EnterpriseConversationNotFoundError,
	type EnterpriseSupportPort,
	runtimeRequest,
} from "./business.ts";
import type { SupportExecutionContext } from "./identity.ts";

const BODY_LIMIT_BYTES = 64 * 1024;
const SESSION_COOKIE = "support_session";

export interface EnterpriseHttpServerOptions {
	auth: EnterpriseAuthService;
	runtime?: SupportRuntimePort;
	supportService?: EnterpriseSupportPort;
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
				? readBusiness(
						request,
						response,
						options,
						url,
						"audit:read",
						(context) => options.supportService?.listAuditEvents(context) ?? Promise.resolve([]),
					)
				: methodNotAllowed(response, "GET");
		if (path.startsWith("/api/")) return sendJson(response, 404, { error: "not_found" });
		if (options.staticRoot && (await serveStaticFile(path, response, options.staticRoot))) return;
		return sendJson(response, 404, { error: "not_found" });
	} catch (error) {
		if (error instanceof EnterpriseConversationNotFoundError) return sendJson(response, 404, { error: "not_found" });
		if (error instanceof EnterpriseConversationConflictError)
			return sendJson(response, 409, { error: "conversation_conflict" });
		return sendJson(response, 500, { error: "internal_error" });
	}
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
	const context = await authenticatedContext(request, options.auth);
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
): Promise<SupportExecutionContext | undefined> {
	return auth.resolveExecutionContext(readCookie(request, SESSION_COOKIE), randomUUID());
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

function sendJson(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
	response.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
	response.end(JSON.stringify(body));
}
