import type { SessionApi } from "../session.ts";
import {
	type AvailabilityBoardDTO,
	type AvailabilityDTO,
	type AvailabilityStatus,
	type AvailabilityWindow,
	type BoundedListDTO,
	type BookingIntentAction,
	type BookingIntentDTO,
	type KnowledgeDTO,
	type NeedsAttentionDTO,
	parseAvailabilityBoard,
	parseAvailabilityDTO,
	parseBookingIntentDTO,
	parseBookingIntentList,
	parseKnowledgeList,
	parseNeedsAttentionList,
} from "./dto.ts";

/**
 * StoreOps API client. Route paths are frozen relative to `/api/v1/storeops` (section 7). Every call
 * reuses the existing same-origin session request layer; browser never sends scope, role, capabilities,
 * customerId, creator or timeZone. Network failure is an explicit error, never an empty success.
 */

export const STOREOPS_BASE = "/api/v1/storeops";

export type StoreOpsReadOutcome<T> =
	| { kind: "success"; value: T }
	| { kind: "session-invalidated" }
	| { kind: "forbidden" }
	| { kind: "error"; message: string };

export type StoreOpsWriteOutcome<T> =
	| { kind: "success"; value: T }
	| { kind: "conflict"; code: string; message: string }
	| { kind: "not_found"; message: string }
	| { kind: "session-invalidated" }
	| { kind: "forbidden" }
	| { kind: "error"; message: string };

export type CreateBookingOutcome =
	| { kind: "success"; intent: BookingIntentDTO; created: boolean }
	| { kind: "conflict"; code: string; message: string }
	| { kind: "not_found"; message: string }
	| { kind: "session-invalidated" }
	| { kind: "forbidden" }
	| { kind: "error"; message: string };

export interface AvailabilityDraft {
	staffMembershipId: string;
	date: string;
	expectedVersion: number;
	windows: AvailabilityWindow[];
	status: AvailabilityStatus;
}

export interface BookingIntentDraft {
	idempotencyKey: string;
	conversationId: string;
	requestedService: string;
	requestedStart?: string;
	requestedEnd?: string;
	preferredStaffMembershipId?: string;
}

export interface BookingTransitionDraft {
	id: string;
	expectedVersion: number;
	action: BookingIntentAction;
	start?: string;
	end?: string;
}

async function readErrorCode(response: Response): Promise<string | undefined> {
	try {
		const value: unknown = await response.json();
		if (value && typeof value === "object" && typeof (value as { error?: unknown }).error === "string") {
			return (value as { error: string }).error;
		}
	} catch {
		// A missing or non-JSON error body is not fatal; the caller falls back to a safe message.
	}
	return undefined;
}

async function readJson(response: Response): Promise<unknown> {
	return response.json();
}

export function newIdempotencyKey(): string {
	return globalThis.crypto.randomUUID();
}

export async function loadAvailability(
	api: SessionApi,
	date: string,
): Promise<StoreOpsReadOutcome<AvailabilityBoardDTO>> {
	let response: Response;
	try {
		response = await api.request(`${STOREOPS_BASE}/availability?date=${encodeURIComponent(date)}`);
	} catch {
		return { kind: "error", message: "Today's availability could not be loaded." };
	}
	if (response.status === 401) return { kind: "session-invalidated" };
	if (response.status === 403) return { kind: "forbidden" };
	if (!response.ok) return { kind: "error", message: "Today's availability could not be loaded." };
	try {
		const board = parseAvailabilityBoard(await readJson(response));
		return board
			? { kind: "success", value: board }
			: { kind: "error", message: "Today's availability could not be verified." };
	} catch {
		return { kind: "error", message: "Today's availability could not be verified." };
	}
}

export async function saveAvailability(
	api: SessionApi,
	draft: AvailabilityDraft,
): Promise<StoreOpsWriteOutcome<AvailabilityDTO>> {
	const path = `${STOREOPS_BASE}/availability/${encodeURIComponent(draft.staffMembershipId)}/${encodeURIComponent(draft.date)}`;
	let response: Response;
	try {
		response = await api.request(path, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				expectedVersion: draft.expectedVersion,
				windows: draft.windows,
				status: draft.status,
			}),
		});
	} catch {
		return { kind: "error", message: "The availability change could not be saved." };
	}
	if (response.status === 401) return { kind: "session-invalidated" };
	if (response.status === 403) return { kind: "forbidden" };
	if (response.status === 404) {
		return { kind: "not_found", message: "That staff member is not available in your scope." };
	}
	if (response.status === 409) {
		const code = (await readErrorCode(response)) ?? "availability_conflict";
		return { kind: "conflict", code, message: "This availability changed elsewhere. Reload before editing." };
	}
	if (!response.ok) return { kind: "error", message: "The availability change could not be saved." };
	try {
		const saved = parseAvailabilityDTO(await readJson(response));
		return saved
			? { kind: "success", value: saved }
			: { kind: "error", message: "The availability change could not be verified." };
	} catch {
		return { kind: "error", message: "The availability change could not be verified." };
	}
}

export async function loadBookingIntents(
	api: SessionApi,
): Promise<StoreOpsReadOutcome<BoundedListDTO<BookingIntentDTO>>> {
	let response: Response;
	try {
		response = await api.request(`${STOREOPS_BASE}/booking-intents`);
	} catch {
		return { kind: "error", message: "Booking intents could not be loaded." };
	}
	if (response.status === 401) return { kind: "session-invalidated" };
	if (response.status === 403) return { kind: "forbidden" };
	if (!response.ok) return { kind: "error", message: "Booking intents could not be loaded." };
	try {
		const list = parseBookingIntentList(await readJson(response));
		return list ? { kind: "success", value: list } : { kind: "error", message: "Booking intents could not be verified." };
	} catch {
		return { kind: "error", message: "Booking intents could not be verified." };
	}
}

export async function createBookingIntent(api: SessionApi, draft: BookingIntentDraft): Promise<CreateBookingOutcome> {
	const body: Record<string, string> = {
		conversationId: draft.conversationId,
		requestedService: draft.requestedService,
	};
	if (draft.requestedStart !== undefined) body.requestedStart = draft.requestedStart;
	if (draft.requestedEnd !== undefined) body.requestedEnd = draft.requestedEnd;
	if (draft.preferredStaffMembershipId !== undefined) body.preferredStaffMembershipId = draft.preferredStaffMembershipId;
	let response: Response;
	try {
		response = await api.request(`${STOREOPS_BASE}/booking-intents`, {
			method: "POST",
			headers: { "content-type": "application/json", "Idempotency-Key": draft.idempotencyKey },
			body: JSON.stringify(body),
		});
	} catch {
		return { kind: "error", message: "The booking intent could not be recorded." };
	}
	if (response.status === 401) return { kind: "session-invalidated" };
	if (response.status === 403) return { kind: "forbidden" };
	if (response.status === 404) {
		return { kind: "not_found", message: "The conversation or preferred staff is not available in your scope." };
	}
	if (response.status === 409) {
		const code = (await readErrorCode(response)) ?? "booking_intent_conflict";
		return { kind: "conflict", code, message: "That idempotency key was already used for a different request." };
	}
	if (!response.ok && response.status !== 201) {
		return { kind: "error", message: "The booking intent could not be recorded." };
	}
	try {
		const intent = parseBookingIntentDTO(await readJson(response));
		return intent
			? { kind: "success", intent, created: response.status === 201 }
			: { kind: "error", message: "The booking intent could not be verified." };
	} catch {
		return { kind: "error", message: "The booking intent could not be verified." };
	}
}

export async function transitionBookingIntent(
	api: SessionApi,
	draft: BookingTransitionDraft,
): Promise<StoreOpsWriteOutcome<BookingIntentDTO>> {
	const body: Record<string, string | number> = { expectedVersion: draft.expectedVersion, action: draft.action };
	if (draft.start !== undefined) body.start = draft.start;
	if (draft.end !== undefined) body.end = draft.end;
	let response: Response;
	try {
		response = await api.request(`${STOREOPS_BASE}/booking-intents/${encodeURIComponent(draft.id)}/transition`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
	} catch {
		return { kind: "error", message: "The booking intent could not be updated." };
	}
	if (response.status === 401) return { kind: "session-invalidated" };
	if (response.status === 403) return { kind: "forbidden" };
	if (response.status === 404) return { kind: "not_found", message: "That booking intent is not available in your scope." };
	if (response.status === 409) {
		const code = (await readErrorCode(response)) ?? "booking_intent_conflict";
		return { kind: "conflict", code, message: "This booking intent changed elsewhere. Reload before acting." };
	}
	if (!response.ok) return { kind: "error", message: "The booking intent could not be updated." };
	try {
		const intent = parseBookingIntentDTO(await readJson(response));
		return intent
			? { kind: "success", value: intent }
			: { kind: "error", message: "The booking intent could not be verified." };
	} catch {
		return { kind: "error", message: "The booking intent could not be verified." };
	}
}

export async function loadKnowledge(api: SessionApi): Promise<StoreOpsReadOutcome<BoundedListDTO<KnowledgeDTO>>> {
	let response: Response;
	try {
		response = await api.request(`${STOREOPS_BASE}/knowledge`);
	} catch {
		return { kind: "error", message: "Approved knowledge could not be loaded." };
	}
	if (response.status === 401) return { kind: "session-invalidated" };
	if (response.status === 403) return { kind: "forbidden" };
	if (!response.ok) return { kind: "error", message: "Approved knowledge could not be loaded." };
	try {
		const list = parseKnowledgeList(await readJson(response));
		return list ? { kind: "success", value: list } : { kind: "error", message: "Approved knowledge could not be verified." };
	} catch {
		return { kind: "error", message: "Approved knowledge could not be verified." };
	}
}

export async function loadNeedsAttention(
	api: SessionApi,
): Promise<StoreOpsReadOutcome<BoundedListDTO<NeedsAttentionDTO>>> {
	let response: Response;
	try {
		response = await api.request(`${STOREOPS_BASE}/needs-attention`);
	} catch {
		return { kind: "error", message: "Needs Attention could not be loaded." };
	}
	if (response.status === 401) return { kind: "session-invalidated" };
	if (response.status === 403) return { kind: "forbidden" };
	if (!response.ok) return { kind: "error", message: "Needs Attention could not be loaded." };
	try {
		const list = parseNeedsAttentionList(await readJson(response));
		return list ? { kind: "success", value: list } : { kind: "error", message: "Needs Attention could not be verified." };
	} catch {
		return { kind: "error", message: "Needs Attention could not be verified." };
	}
}
