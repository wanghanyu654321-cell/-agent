import { describe, expect, it } from "vitest";
import type { SessionApi } from "../../web/src/session.ts";
import { applyAuthenticatedApiStatus } from "../../web/src/session.ts";
import {
	createBookingIntent,
	loadAvailability,
	loadBookingIntents,
	loadKnowledge,
	loadNeedsAttention,
	newIdempotencyKey,
	STOREOPS_BASE,
	saveAvailability,
	transitionBookingIntent,
} from "../../web/src/storeops/api.ts";
import type { AvailabilityDTO, BookingIntentDTO } from "../../web/src/storeops/dto.ts";

/**
 * Deterministic StoreOps API-client contract tests (section 7). Each call is exercised against a mock
 * SessionApi that records the exact frozen path/method/body/headers and replays a canned Response, so we
 * assert the wire contract without a browser: relative routes, no scope/role/customerId ever sent, and the
 * full status mapping (200/201/401/403/404/409/500 and a thrown network failure that is never an empty
 * success). Malformed bodies fail closed to "could not be verified".
 */

interface RecordedRequest {
	path: string;
	method: string;
	body: Record<string, unknown> | undefined;
	headers: Record<string, string>;
}

function apiWith(responses: Response[]): SessionApi & { requests: RecordedRequest[] } {
	const requests: RecordedRequest[] = [];
	return {
		requests,
		async request(path, init = {}) {
			requests.push({
				path,
				method: init.method ?? "GET",
				body: typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined,
				headers: (init.headers ?? {}) as Record<string, string>,
			});
			const next = responses.shift();
			if (!next) throw new Error("Unexpected request.");
			return next;
		},
	};
}

function networkDown(): SessionApi {
	return {
		async request() {
			throw new Error("network unreachable");
		},
	};
}

function response(status: number, body?: unknown): Response {
	return new Response(body === undefined ? undefined : JSON.stringify(body), {
		status,
		headers: body === undefined ? undefined : { "content-type": "application/json" },
	});
}

const availability: AvailabilityDTO = {
	id: "avail-1",
	staffMembershipId: "member-1",
	staffDisplayName: "Ava",
	localDate: "2026-09-05",
	timeZone: "Asia/Shanghai",
	windows: [{ start: "09:00", end: "12:00" }],
	status: "published",
	source: "human",
	version: 3,
	updatedAt: "2026-09-05T01:00:00.000Z",
};

const board = {
	items: [availability],
	staff: [{ membershipId: "member-1", displayName: "Ava" }],
	timeZone: "Asia/Shanghai",
};

const intent: BookingIntentDTO = {
	id: "intent-1",
	conversationId: "conversation-a",
	customerId: "customer-a",
	requestedService: "Gel manicure",
	requestedStart: "2026-09-06T02:00:00.000Z",
	requestedEnd: "2026-09-06T03:00:00.000Z",
	preferredStaffMembershipId: null,
	status: "pending_confirmation",
	alternativeStart: null,
	alternativeEnd: null,
	confirmedStart: null,
	confirmedEnd: null,
	createdByUserId: "user-agent",
	version: 1,
	createdAt: "2026-09-05T01:00:00.000Z",
	updatedAt: "2026-09-05T01:00:00.000Z",
};

const knowledge = {
	id: "kb-1",
	kind: "policy",
	title: "Refund window",
	version: "v1",
	sourceRef: "test://kb-1",
	updatedAt: "2026-09-01T00:00:00.000Z",
	status: "approved",
};

const attention = {
	conversationId: "conversation-a",
	basis: "fallback",
	handoffId: null,
	lastActivityAt: "2026-09-05T01:00:00.000Z",
};

const alice = {
	actor: { userId: "user-agent", role: "agent", capabilities: ["storeops:read"] },
	scope: { tenantId: "tenant-a", storeId: "store-a1" },
	request: { requestId: "request-1" },
};

describe("StoreOps base route and idempotency key", () => {
	it("freezes the base path and issues distinct RFC4122 idempotency keys", () => {
		expect(STOREOPS_BASE).toBe("/api/v1/storeops");
		const first = newIdempotencyKey();
		const second = newIdempotencyKey();
		expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
		expect(first).not.toBe(second);
	});
});

describe("GET availability (section 7)", () => {
	it("requests the frozen date-scoped path and never sends scope in the query", async () => {
		const api = apiWith([response(200, board)]);
		const outcome = await loadAvailability(api, "2026-09-05");
		expect(outcome).toEqual({ kind: "success", value: board });
		expect(api.requests).toEqual([
			{ path: "/api/v1/storeops/availability?date=2026-09-05", method: "GET", body: undefined, headers: {} },
		]);
	});

	it("maps 401 to session-invalidated, 403 to forbidden, 500 and network failure to an explicit error", async () => {
		expect(await loadAvailability(apiWith([response(401)]), "2026-09-05")).toEqual({ kind: "session-invalidated" });
		expect(await loadAvailability(apiWith([response(403)]), "2026-09-05")).toEqual({ kind: "forbidden" });
		expect(await loadAvailability(apiWith([response(500)]), "2026-09-05")).toEqual({
			kind: "error",
			message: "Today's availability could not be loaded.",
		});
		expect(await loadAvailability(networkDown(), "2026-09-05")).toEqual({
			kind: "error",
			message: "Today's availability could not be loaded.",
		});
	});

	it("fails closed on a board that cannot be verified rather than showing an empty day", async () => {
		const outcome = await loadAvailability(
			apiWith([response(200, { items: [], staff: [], scope: "injected" })]),
			"2026-09-05",
		);
		expect(outcome).toEqual({ kind: "error", message: "Today's availability could not be verified." });
	});
});

describe("PUT availability (sections 4.3 and 7)", () => {
	it("sends expectedVersion/windows/status only, keyed by staff and date", async () => {
		const api = apiWith([response(200, { ...availability, version: 4 })]);
		const outcome = await saveAvailability(api, {
			staffMembershipId: "member-1",
			date: "2026-09-05",
			expectedVersion: 3,
			windows: [{ start: "09:00", end: "12:00" }],
			status: "published",
		});
		expect(outcome.kind).toBe("success");
		expect(api.requests).toEqual([
			{
				path: "/api/v1/storeops/availability/member-1/2026-09-05",
				method: "PUT",
				body: { expectedVersion: 3, windows: [{ start: "09:00", end: "12:00" }], status: "published" },
				headers: { "content-type": "application/json" },
			},
		]);
	});

	it("surfaces a 409 as a version conflict carrying the server error code, and 404 as not_found", async () => {
		const conflict = await saveAvailability(apiWith([response(409, { error: "availability_conflict" })]), {
			staffMembershipId: "member-1",
			date: "2026-09-05",
			expectedVersion: 2,
			windows: [],
			status: "published",
		});
		expect(conflict).toEqual({
			kind: "conflict",
			code: "availability_conflict",
			message: "This availability changed elsewhere. Reload before editing.",
		});
		const missing = await saveAvailability(apiWith([response(404)]), {
			staffMembershipId: "member-x",
			date: "2026-09-05",
			expectedVersion: 0,
			windows: [],
			status: "published",
		});
		expect(missing.kind).toBe("not_found");
	});

	it("retains identity for 403 and invalidates the session for 401", async () => {
		expect(
			await saveAvailability(apiWith([response(403)]), {
				staffMembershipId: "member-1",
				date: "2026-09-05",
				expectedVersion: 3,
				windows: [],
				status: "published",
			}),
		).toEqual({ kind: "forbidden" });
		expect(applyAuthenticatedApiStatus({ phase: "authenticated", context: alice }, 401)).toEqual({
			phase: "session-invalidated",
		});
		expect(applyAuthenticatedApiStatus({ phase: "authenticated", context: alice }, 403)).toEqual({
			phase: "authorization-error",
			context: alice,
		});
	});
});

describe("GET and POST booking intents (sections 4.4 and 7)", () => {
	it("lists intents from the frozen collection path", async () => {
		const api = apiWith([response(200, { items: [intent] })]);
		const outcome = await loadBookingIntents(api);
		expect(outcome).toEqual({ kind: "success", value: { items: [intent], truncated: undefined } });
		expect(api.requests[0]).toMatchObject({
			path: "/api/v1/storeops/booking-intents",
			method: "GET",
			body: undefined,
		});
	});

	it("creates with an Idempotency-Key header, omits unset optional fields, and marks 201 created vs 200 replay", async () => {
		const created = apiWith([response(201, intent)]);
		const createdOutcome = await createBookingIntent(created, {
			idempotencyKey: "key-1",
			conversationId: "conversation-a",
			requestedService: "Gel manicure",
		});
		expect(createdOutcome).toEqual({ kind: "success", intent, created: true });
		expect(created.requests[0].headers["Idempotency-Key"]).toBe("key-1");
		expect(created.requests[0].body).toEqual({ conversationId: "conversation-a", requestedService: "Gel manicure" });

		const replay = apiWith([response(200, intent)]);
		const replayOutcome = await createBookingIntent(replay, {
			idempotencyKey: "key-1",
			conversationId: "conversation-a",
			requestedService: "Gel manicure",
			requestedStart: "2026-09-06T02:00:00.000Z",
			requestedEnd: "2026-09-06T03:00:00.000Z",
			preferredStaffMembershipId: "member-1",
		});
		expect(replayOutcome).toEqual({ kind: "success", intent, created: false });
		expect(replay.requests[0].body).toEqual({
			conversationId: "conversation-a",
			requestedService: "Gel manicure",
			requestedStart: "2026-09-06T02:00:00.000Z",
			requestedEnd: "2026-09-06T03:00:00.000Z",
			preferredStaffMembershipId: "member-1",
		});
	});

	it("maps a reused-key 409 to a conflict and an out-of-scope 404 to not_found", async () => {
		expect(
			await createBookingIntent(apiWith([response(409, { error: "booking_intent_conflict" })]), {
				idempotencyKey: "key-1",
				conversationId: "conversation-a",
				requestedService: "Gel manicure",
			}),
		).toEqual({
			kind: "conflict",
			code: "booking_intent_conflict",
			message: "That idempotency key was already used for a different request.",
		});
		expect(
			(
				await createBookingIntent(apiWith([response(404)]), {
					idempotencyKey: "key-2",
					conversationId: "conversation-x",
					requestedService: "Gel manicure",
				})
			).kind,
		).toBe("not_found");
	});

	it("transitions an intent with expectedVersion and action, adding start/end only when supplied", async () => {
		const api = apiWith([response(200, { ...intent, status: "confirmed", version: 2 })]);
		const outcome = await transitionBookingIntent(api, {
			id: "intent-1",
			expectedVersion: 1,
			action: "confirm",
			start: "2026-09-06T02:00:00.000Z",
			end: "2026-09-06T03:00:00.000Z",
		});
		expect(outcome.kind).toBe("success");
		expect(api.requests[0]).toMatchObject({
			path: "/api/v1/storeops/booking-intents/intent-1/transition",
			method: "POST",
			body: {
				expectedVersion: 1,
				action: "confirm",
				start: "2026-09-06T02:00:00.000Z",
				end: "2026-09-06T03:00:00.000Z",
			},
		});

		const cancel = apiWith([response(200, { ...intent, status: "cancelled", version: 2 })]);
		await transitionBookingIntent(cancel, { id: "intent-1", expectedVersion: 1, action: "cancel" });
		expect(cancel.requests[0].body).toEqual({ expectedVersion: 1, action: "cancel" });
	});

	it("treats a stale transition as a 409 conflict that reloads rather than silently retrying", async () => {
		const outcome = await transitionBookingIntent(apiWith([response(409, { error: "booking_intent_conflict" })]), {
			id: "intent-1",
			expectedVersion: 1,
			action: "confirm",
		});
		expect(outcome).toEqual({
			kind: "conflict",
			code: "booking_intent_conflict",
			message: "This booking intent changed elsewhere. Reload before acting.",
		});
	});
});

describe("GET knowledge and needs-attention (section 7)", () => {
	it("loads approved registry metadata from the frozen knowledge path", async () => {
		const api = apiWith([response(200, { items: [knowledge] })]);
		const outcome = await loadKnowledge(api);
		expect(outcome).toEqual({ kind: "success", value: { items: [knowledge], truncated: undefined } });
		expect(api.requests[0]).toMatchObject({ path: "/api/v1/storeops/knowledge", method: "GET", body: undefined });
	});

	it("loads the manager review queue from the frozen needs-attention path", async () => {
		const api = apiWith([response(200, { items: [attention] })]);
		const outcome = await loadNeedsAttention(api);
		expect(outcome).toEqual({ kind: "success", value: { items: [attention], truncated: undefined } });
		expect(api.requests[0]).toMatchObject({
			path: "/api/v1/storeops/needs-attention",
			method: "GET",
			body: undefined,
		});
	});

	it("turns a network failure on either read into an explicit error, never an empty success", async () => {
		expect(await loadKnowledge(networkDown())).toEqual({
			kind: "error",
			message: "Approved knowledge could not be loaded.",
		});
		expect(await loadNeedsAttention(networkDown())).toEqual({
			kind: "error",
			message: "Needs Attention could not be loaded.",
		});
	});
});
