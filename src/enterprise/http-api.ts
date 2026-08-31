import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { SupportRuntimePort } from "../http-api.ts";
import type { SupportRequest, SupportResult } from "../index.ts";
import type { EnterpriseAuthService } from "./auth.ts";
import type { Capability, SupportExecutionContext } from "./identity.ts";

const BODY_LIMIT_BYTES = 64 * 1024;
const SESSION_COOKIE = "support_session";

export interface EnterpriseHttpServerOptions {
	auth: EnterpriseAuthService;
	runtime: SupportRuntimePort;
	secureCookies?: boolean;
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
	const path = new URL(request.url ?? "/", "http://localhost").pathname;
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
		return sendJson(response, 404, { error: "not_found" });
	} catch {
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
	const result = await options.runtime.run(legacySupportRequest(body, context));
	return sendJson(response, 200, publicSupportResult(result));
}

async function authenticatedContext(
	request: IncomingMessage,
	auth: EnterpriseAuthService,
): Promise<SupportExecutionContext | undefined> {
	return auth.resolveExecutionContext(readCookie(request, SESSION_COOKIE), randomUUID());
}

function legacySupportRequest(body: Record<string, unknown>, context: SupportExecutionContext): SupportRequest {
	const capabilities = new Set<Capability>(context.actor.capabilities);
	return {
		conversationId: requiredString(body, "conversationId"),
		customerId: requiredString(body, "customerId"),
		text: requiredString(body, "text"),
		tenantId: context.scope.tenantId,
		storeId: context.scope.storeId,
		permissions: [
			...(capabilities.has("ticket:create") ? ["tickets:write"] : []),
			...(capabilities.has("handoff:create") ? ["handoff:write"] : []),
		],
		mayEscalate: capabilities.has("handoff:create"),
	};
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

function sendJson(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
	response.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
	response.end(JSON.stringify(body));
}
