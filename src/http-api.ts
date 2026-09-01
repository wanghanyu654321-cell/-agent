import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { SupportRequest, SupportResult } from "./index.ts";

export const PORTFOLIO_JSON_BODY_LIMIT_BYTES = 64 * 1024;

export interface SupportRuntimePort {
	run(request: SupportRequest): Promise<SupportResult>;
}

class InvalidRequestError extends Error {}

class RequestBodyTooLargeError extends Error {}

export function createPortfolioHttpServer(runtime: SupportRuntimePort): Server {
	return createServer((request, response) => {
		void handleRequest(request, response, runtime);
	});
}

async function handleRequest(
	request: IncomingMessage,
	response: ServerResponse,
	runtime: SupportRuntimePort,
): Promise<void> {
	const pathname = requestPathname(request);
	if (pathname === "/healthz") {
		if (request.method !== "GET") return methodNotAllowed(response, "GET");
		return sendJson(response, 200, { status: "ok" });
	}
	if (pathname !== "/api/v1/support/respond") return sendJson(response, 404, { error: "not_found" });
	if (request.method !== "POST") return methodNotAllowed(response, "POST");

	try {
		const body = await readJsonBody(request);
		const supportRequest = parseSupportRequest(body);
		const result = await runtime.run(supportRequest);
		return sendJson(response, 200, publicSupportResult(result));
	} catch (error) {
		if (error instanceof RequestBodyTooLargeError)
			return sendJson(response, 413, { error: "request_body_too_large" });
		if (error instanceof InvalidRequestError) return sendJson(response, 400, { error: "invalid_request" });
		return sendJson(response, 500, { error: "internal_error" });
	}
}

function requestPathname(request: IncomingMessage): string {
	try {
		return new URL(request.url ?? "/", "http://localhost").pathname;
	} catch {
		return "";
	}
}

function methodNotAllowed(response: ServerResponse, allowedMethod: "GET" | "POST"): void {
	sendJson(response, 405, { error: "method_not_allowed" }, { Allow: allowedMethod });
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
	const declaredLength = request.headers["content-length"];
	if (typeof declaredLength === "string" && Number.parseInt(declaredLength, 10) > PORTFOLIO_JSON_BODY_LIMIT_BYTES) {
		request.resume();
		throw new RequestBodyTooLargeError();
	}

	const chunks: Buffer[] = [];
	let receivedBytes = 0;
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		receivedBytes += buffer.byteLength;
		if (receivedBytes <= PORTFOLIO_JSON_BODY_LIMIT_BYTES) chunks.push(buffer);
	}
	if (receivedBytes > PORTFOLIO_JSON_BODY_LIMIT_BYTES) throw new RequestBodyTooLargeError();
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		throw new InvalidRequestError();
	}
}

function parseSupportRequest(value: unknown): SupportRequest {
	if (!isRecord(value)) throw new InvalidRequestError();
	const conversationId = requiredString(value.conversationId);
	const tenantId = requiredString(value.tenantId);
	const storeId = requiredString(value.storeId);
	const customerId = requiredString(value.customerId);
	const text = requiredString(value.text);
	const permissions = optionalStringArray(value.permissions);
	const mayEscalate = optionalBoolean(value.mayEscalate);
	const requiresEscalation = optionalBoolean(value.requiresEscalation);
	return {
		conversationId,
		tenantId,
		storeId,
		customerId,
		text,
		...(permissions === undefined ? {} : { permissions }),
		...(mayEscalate === undefined ? {} : { mayEscalate }),
		...(requiresEscalation === undefined ? {} : { requiresEscalation }),
	};
}

function requiredString(value: unknown): string {
	if (typeof value !== "string" || value.trim().length === 0) throw new InvalidRequestError();
	return value;
}

function optionalStringArray(value: unknown): string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new InvalidRequestError();
	return value;
}

function optionalBoolean(value: unknown): boolean | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "boolean") throw new InvalidRequestError();
	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
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

function sendJson(
	response: ServerResponse,
	statusCode: number,
	body: Record<string, unknown>,
	headers: Record<string, string> = {},
): void {
	response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8", ...headers });
	response.end(JSON.stringify(body));
}
