import { describe, expect, it } from "vitest";
import type { SessionApi } from "../../web/src/session.ts";
import { createBookingIntent, transitionBookingIntent } from "../../web/src/storeops/api.ts";
import {
	parseOptionalInterval,
	parseRequiredInterval,
	parseRfc3339Instant,
	RFC3339_OFFSET_REQUIRED,
} from "../../web/src/storeops/booking-intents.tsx";
import type { BookingIntentDTO } from "../../web/src/storeops/dto.ts";

/**
 * BookingIntent wall-clock delta fix (Track C, Independent Gate: APPROVED WITH CONDITIONS). A
 * `datetime-local` value carries no offset, so `new Date(value)` interpreted it in the browser/device
 * timezone and could silently shift the store's business time when the manager is physically elsewhere.
 * These deterministic tests prove the surface now (1) accepts an RFC3339 `Z` instant, (2) accepts an
 * explicit numeric offset, (3) rejects offset-less values, (4) never derives the instant from the host
 * timezone, and that (5) create and (6) propose/confirm transition send the exact intended instant.
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

function response(status: number, body?: unknown): Response {
	return new Response(body === undefined ? undefined : JSON.stringify(body), {
		status,
		headers: body === undefined ? undefined : { "content-type": "application/json" },
	});
}

const intent: BookingIntentDTO = {
	id: "intent-1",
	conversationId: "conversation-a",
	customerId: "customer-a",
	requestedService: "Gel manicure",
	requestedStart: "2026-09-06T07:00:00.000Z",
	requestedEnd: "2026-09-06T09:00:00.000Z",
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

describe("parseRfc3339Instant requires an explicit offset (delta fix)", () => {
	it("accepts an RFC3339 instant with a Z designator", () => {
		expect(parseRfc3339Instant("2026-09-06T07:00:00Z")).toBe("2026-09-06T07:00:00.000Z");
		expect(parseRfc3339Instant("2026-09-06T07:00:00.000Z")).toBe("2026-09-06T07:00:00.000Z");
	});

	it("accepts an explicit numeric offset and normalizes to the same absolute instant", () => {
		expect(parseRfc3339Instant("2026-09-06T15:00:00+08:00")).toBe("2026-09-06T07:00:00.000Z");
		expect(parseRfc3339Instant("2026-09-06T16:00:00+09:00")).toBe("2026-09-06T07:00:00.000Z");
		expect(parseRfc3339Instant("2026-09-06T02:00:00-05:00")).toBe("2026-09-06T07:00:00.000Z");
	});

	it("rejects offset-less and non-RFC3339 values instead of reinterpreting them", () => {
		expect(parseRfc3339Instant("2026-09-06T15:00")).toBeUndefined();
		expect(parseRfc3339Instant("2026-09-06T15:00:00")).toBeUndefined();
		expect(parseRfc3339Instant("2026-09-06 15:00")).toBeUndefined();
		expect(parseRfc3339Instant("15:00")).toBeUndefined();
		expect(parseRfc3339Instant("")).toBeUndefined();
		expect(parseRfc3339Instant("soon")).toBeUndefined();
	});

	it("never derives the business instant from the browser/OS timezone", () => {
		const original = process.env.TZ;
		try {
			process.env.TZ = "Asia/Tokyo";
			const tokyo = parseRfc3339Instant("2026-09-06T15:00:00+08:00");
			const tokyoOffsetLess = parseRfc3339Instant("2026-09-06T15:00:00");
			process.env.TZ = "America/New_York";
			const newYork = parseRfc3339Instant("2026-09-06T15:00:00+08:00");
			const newYorkOffsetLess = parseRfc3339Instant("2026-09-06T15:00:00");
			// The same explicit offset yields the identical instant in any host zone ...
			expect(tokyo).toBe("2026-09-06T07:00:00.000Z");
			expect(newYork).toBe("2026-09-06T07:00:00.000Z");
			expect(tokyo).toBe(newYork);
			// ... and an offset-less value is rejected in every zone rather than read as local time.
			expect(tokyoOffsetLess).toBeUndefined();
			expect(newYorkOffsetLess).toBeUndefined();
		} finally {
			if (original === undefined) delete process.env.TZ;
			else process.env.TZ = original;
		}
	});
});

describe("BookingIntent interval validation fails closed on ambiguous input", () => {
	it("create form: blank times are allowed, but a non-blank offset-less time is rejected", () => {
		expect(parseOptionalInterval("", "")).toEqual({ ok: true, start: undefined, end: undefined });
		expect(parseOptionalInterval("2026-09-06T15:00", "2026-09-06T17:00")).toEqual({
			ok: false,
			message: RFC3339_OFFSET_REQUIRED,
		});
	});

	it("create form: a valid offset pair normalizes to exact instants with end after start", () => {
		expect(parseOptionalInterval("2026-09-06T15:00:00+08:00", "2026-09-06T17:00:00+08:00")).toEqual({
			ok: true,
			start: "2026-09-06T07:00:00.000Z",
			end: "2026-09-06T09:00:00.000Z",
		});
	});

	it("create form: one-sided or out-of-order instants are rejected", () => {
		expect(parseOptionalInterval("2026-09-06T15:00:00+08:00", "").ok).toBe(false);
		expect(parseOptionalInterval("", "2026-09-06T17:00:00+08:00").ok).toBe(false);
		expect(parseOptionalInterval("2026-09-06T17:00:00+08:00", "2026-09-06T15:00:00+08:00").ok).toBe(false);
	});

	it("transition: both ends are required and must be valid RFC3339 instants", () => {
		expect(parseRequiredInterval("", "")).toEqual({ ok: false, message: RFC3339_OFFSET_REQUIRED });
		expect(parseRequiredInterval("2026-09-06T15:00", "2026-09-06T17:00")).toEqual({
			ok: false,
			message: RFC3339_OFFSET_REQUIRED,
		});
		expect(parseRequiredInterval("2026-09-06T15:00:00+08:00", "2026-09-06T17:00:00+08:00")).toEqual({
			ok: true,
			start: "2026-09-06T07:00:00.000Z",
			end: "2026-09-06T09:00:00.000Z",
		});
	});
});

describe("BookingIntent writes carry the exact intended instant on the wire", () => {
	it("create sends the instant derived from the explicit offset, not the browser zone", async () => {
		const interval = parseOptionalInterval("2026-09-06T15:00:00+08:00", "2026-09-06T17:00:00+08:00");
		expect(interval.ok).toBe(true);
		if (!interval.ok) return;
		const api = apiWith([response(201, intent)]);
		await createBookingIntent(api, {
			idempotencyKey: "key-1",
			conversationId: "conversation-a",
			requestedService: "Gel manicure",
			requestedStart: interval.start,
			requestedEnd: interval.end,
		});
		expect(api.requests[0].body).toEqual({
			conversationId: "conversation-a",
			requestedService: "Gel manicure",
			requestedStart: "2026-09-06T07:00:00.000Z",
			requestedEnd: "2026-09-06T09:00:00.000Z",
		});
	});

	it("propose/confirm transition sends the exact intended instant", async () => {
		const interval = parseRequiredInterval("2026-09-06T15:00:00+08:00", "2026-09-06T17:00:00+08:00");
		expect(interval.ok).toBe(true);
		if (!interval.ok) return;
		const api = apiWith([response(200, { ...intent, status: "alternative_proposed", version: 2 })]);
		await transitionBookingIntent(api, {
			id: "intent-1",
			expectedVersion: 1,
			action: "propose_alternative",
			start: interval.start,
			end: interval.end,
		});
		expect(api.requests[0].body).toEqual({
			expectedVersion: 1,
			action: "propose_alternative",
			start: "2026-09-06T07:00:00.000Z",
			end: "2026-09-06T09:00:00.000Z",
		});
	});
});
