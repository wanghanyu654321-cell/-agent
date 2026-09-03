import type { SessionApi } from "./session.ts";

export interface ScopedTicket {
	id: string;
	tenantId: string;
	storeId: string;
	conversationId: string;
	summary: string;
	idempotencyKey: string;
	createdAt: string;
}

export interface ScopedHandoff {
	id: string;
	tenantId: string;
	storeId: string;
	conversationId: string;
	reason: string;
	createdAt: string;
}

export type BusinessProofOutcome =
	| { kind: "success"; tickets: ScopedTicket[]; handoffs: ScopedHandoff[] }
	| { kind: "session-invalidated" }
	| { kind: "forbidden" }
	| { kind: "error"; message: string };

const unavailable = { kind: "error", message: "Durable business state could not be verified." } as const;

export async function loadScopedBusinessProof(
	api: SessionApi,
	scope: { tenantId: string; storeId: string },
): Promise<BusinessProofOutcome> {
	let ticketResponse: Response;
	let handoffResponse: Response;
	try {
		[ticketResponse, handoffResponse] = await Promise.all([
			api.request("/api/v1/tickets"),
			api.request("/api/v1/handoffs"),
		]);
	} catch {
		return unavailable;
	}
	if (ticketResponse.status === 401 || handoffResponse.status === 401) return { kind: "session-invalidated" };
	if (ticketResponse.status === 403 || handoffResponse.status === 403) return { kind: "forbidden" };
	if (!ticketResponse.ok || !handoffResponse.ok) return unavailable;
	try {
		const tickets = parseTickets(await ticketResponse.json(), scope);
		const handoffs = parseHandoffs(await handoffResponse.json(), scope);
		return tickets && handoffs ? { kind: "success", tickets, handoffs } : unavailable;
	} catch {
		return unavailable;
	}
}

function parseTickets(value: unknown, scope: { tenantId: string; storeId: string }): ScopedTicket[] | undefined {
	return Array.isArray(value) && value.every((item) => isTicket(item, scope)) ? value : undefined;
}

function parseHandoffs(value: unknown, scope: { tenantId: string; storeId: string }): ScopedHandoff[] | undefined {
	return Array.isArray(value) && value.every((item) => isHandoff(item, scope)) ? value : undefined;
}

function isTicket(value: unknown, scope: { tenantId: string; storeId: string }): value is ScopedTicket {
	return hasScope(value, scope) && hasStrings(value, ["id", "conversationId", "summary", "idempotencyKey", "createdAt"]);
}

function isHandoff(value: unknown, scope: { tenantId: string; storeId: string }): value is ScopedHandoff {
	return hasScope(value, scope) && hasStrings(value, ["id", "conversationId", "reason", "createdAt"]);
}

function hasScope(value: unknown, scope: { tenantId: string; storeId: string }): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value) &&
		(value as Record<string, unknown>).tenantId === scope.tenantId && (value as Record<string, unknown>).storeId === scope.storeId;
}

function hasStrings(value: Record<string, unknown>, keys: string[]): boolean {
	return keys.every((key) => typeof value[key] === "string");
}
