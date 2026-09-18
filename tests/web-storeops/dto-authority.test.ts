import { describe, expect, it } from "vitest";
import {
	bookingActionNeedsInterval,
	canCreateBookingIntent,
	canManageBookingIntent,
	canReadStoreOps,
	canViewNeedsAttention,
	canWriteAvailability,
	permittedBookingActions,
	type StoreOpsActor,
} from "../../web/src/storeops/authority.ts";
import { localDateIn } from "../../web/src/storeops/availability.tsx";
import {
	type AvailabilityDTO,
	type BookingIntentDTO,
	isAvailabilityDTO,
	isBookingIntentDTO,
	isKnowledgeDTO,
	isNeedsAttentionDTO,
	parseAvailabilityBoard,
	parseBookingIntentList,
	parseKnowledgeList,
	parseNeedsAttentionList,
	validateWindows,
} from "../../web/src/storeops/dto.ts";
import { StoreOpsReadLifecycle, StoreOpsSubmitLifecycle } from "../../web/src/storeops/lifecycle.ts";

function mutate(base: object, override: Record<string, unknown>): unknown {
	return { ...base, ...override };
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

describe("frozen StoreOps DTO parsers fail closed", () => {
	it("accepts an exact AvailabilityDTO and rejects unknown or malformed fields", () => {
		expect(isAvailabilityDTO(availability)).toBe(true);
		expect(isAvailabilityDTO(mutate(availability, { leakedPayload: "x" }))).toBe(false);
		expect(isAvailabilityDTO(mutate(availability, { version: 0 }))).toBe(false);
		expect(isAvailabilityDTO(mutate(availability, { version: 2.5 }))).toBe(false);
		expect(isAvailabilityDTO(mutate(availability, { status: "unknown" }))).toBe(false);
		expect(isAvailabilityDTO(mutate(availability, { source: "model" }))).toBe(false);
		expect(isAvailabilityDTO(mutate(availability, { localDate: "09/05/2026" }))).toBe(false);
		expect(isAvailabilityDTO(mutate(availability, { updatedAt: "yesterday" }))).toBe(false);
		expect(isAvailabilityDTO(mutate(availability, { windows: [{ start: "9am", end: "12pm" }] }))).toBe(false);
	});

	it("rejects an availability board with unstated keys or a missing roster/timeZone", () => {
		const board = {
			items: [availability],
			staff: [{ membershipId: "member-1", displayName: "Ava" }],
			timeZone: "Asia/Shanghai",
		};
		expect(parseAvailabilityBoard(board)).toBeDefined();
		expect(parseAvailabilityBoard(mutate(board, { scope: "injected" }))).toBeUndefined();
		expect(parseAvailabilityBoard({ items: [availability], staff: [] })).toBeUndefined();
		expect(parseAvailabilityBoard(mutate(board, { timeZone: "" }))).toBeUndefined();
	});

	it("accepts an exact BookingIntentDTO and rejects unknown or malformed fields", () => {
		expect(isBookingIntentDTO(intent)).toBe(true);
		expect(isBookingIntentDTO(mutate(intent, { channelBindingId: "leak" }))).toBe(false);
		expect(isBookingIntentDTO(mutate(intent, { status: "auto_confirmed" }))).toBe(false);
		expect(isBookingIntentDTO(mutate(intent, { requestedStart: "soon" }))).toBe(false);
		expect(isBookingIntentDTO(mutate(intent, { createdByUserId: "" }))).toBe(false);
		expect(isBookingIntentDTO(mutate(intent, { version: -1 }))).toBe(false);
	});

	it("accepts approved KnowledgeDTO and NeedsAttentionDTO and rejects drift", () => {
		const knowledge = {
			id: "kb-1",
			kind: "policy",
			title: "Refund window",
			version: "v1",
			sourceRef: "test://kb-1",
			updatedAt: "2026-09-01T00:00:00.000Z",
			status: "approved",
		};
		expect(isKnowledgeDTO(knowledge)).toBe(true);
		expect(isKnowledgeDTO(mutate(knowledge, { status: "pending" }))).toBe(false);
		expect(isKnowledgeDTO(mutate(knowledge, { kind: "blog" }))).toBe(false);
		expect(isKnowledgeDTO(mutate(knowledge, { body: "raw content" }))).toBe(false);

		const attention = {
			conversationId: "conversation-a",
			basis: "fallback",
			handoffId: null,
			lastActivityAt: "2026-09-05T01:00:00.000Z",
		};
		expect(isNeedsAttentionDTO(attention)).toBe(true);
		expect(isNeedsAttentionDTO(mutate(attention, { basis: "resolved" }))).toBe(false);
		expect(isNeedsAttentionDTO(mutate(attention, { diagnosis: "price exception" }))).toBe(false);
	});

	it("parses bounded list envelopes and rejects a malformed item or unstated key", () => {
		expect(parseBookingIntentList({ items: [intent] })?.items).toHaveLength(1);
		expect(parseBookingIntentList({ items: [intent], truncated: true })?.truncated).toBe(true);
		expect(parseBookingIntentList({ items: [intent], truncated: "yes" })).toBeUndefined();
		expect(parseBookingIntentList({ items: [mutate(intent, { status: "bogus" })] })).toBeUndefined();
		expect(parseBookingIntentList({ items: [intent], nextCursor: "x" })).toBeUndefined();
		expect(parseKnowledgeList({ items: [] })?.items).toEqual([]);
		expect(parseNeedsAttentionList([{ conversationId: "c" }])).toBeUndefined();
	});
});

describe("availability window validation (section 4.3)", () => {
	it("allows an empty published draft and adjacent half-open windows", () => {
		expect(validateWindows([])).toBeUndefined();
		expect(validateWindows([{ start: "09:00", end: "12:00" }])).toBeUndefined();
		expect(
			validateWindows([
				{ start: "09:00", end: "12:00" },
				{ start: "12:00", end: "15:00" },
			]),
		).toBeUndefined();
	});

	it("rejects overlap, bad order, bad format and too many windows", () => {
		expect(
			validateWindows([
				{ start: "09:00", end: "12:00" },
				{ start: "11:00", end: "13:00" },
			]),
		).toBe("overlap");
		expect(validateWindows([{ start: "12:00", end: "09:00" }])).toBe("end_before_start");
		expect(validateWindows([{ start: "09:00", end: "09:00" }])).toBe("end_before_start");
		expect(validateWindows([{ start: "9:00", end: "12:00" }])).toBe("bad_format");
		expect(validateWindows([{ start: "09:00", end: "25:00" }])).toBe("bad_format");
		const many = Array.from({ length: 25 }, () => ({ start: "09:00", end: "10:00" }));
		expect(validateWindows(many)).toBe("too_many");
	});

	it("resolves a local YYYY-MM-DD date for a supplied zone and without one", () => {
		expect(localDateIn("Asia/Shanghai")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(localDateIn()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(localDateIn("Not/AZone")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});

const agent: StoreOpsActor = {
	userId: "user-agent",
	role: "agent",
	capabilities: ["agent:invoke", "conversation:read", "ticket:create", "storeops:read", "booking-intent:create"],
};
const supervisor: StoreOpsActor = {
	userId: "user-supervisor",
	role: "supervisor",
	capabilities: ["storeops:read", "availability:write", "booking-intent:create", "booking-intent:manage"],
};
const admin: StoreOpsActor = {
	userId: "user-admin",
	role: "admin",
	capabilities: [
		"storeops:read",
		"availability:write",
		"booking-intent:create",
		"booking-intent:manage",
		"audit:read",
	],
};

describe("StoreOps authority gates (sections 3 and 4.5)", () => {
	it("maps capabilities to the additive StoreOps permissions", () => {
		expect(canReadStoreOps(agent)).toBe(true);
		expect(canWriteAvailability(agent)).toBe(false);
		expect(canWriteAvailability(supervisor)).toBe(true);
		expect(canCreateBookingIntent(agent)).toBe(true);
		expect(canManageBookingIntent(agent)).toBe(false);
		expect(canManageBookingIntent(admin)).toBe(true);
	});

	it("restricts the Needs Attention manager view to supervisor/admin with storeops:read", () => {
		expect(canViewNeedsAttention(agent)).toBe(false);
		expect(canViewNeedsAttention(supervisor)).toBe(true);
		expect(canViewNeedsAttention(admin)).toBe(true);
		expect(canViewNeedsAttention({ userId: "x", role: "admin", capabilities: [] })).toBe(false);
	});
});

describe("BookingIntent permitted actions (section 4.4)", () => {
	it("grants managers confirm/propose/cancel exactly as the state matrix allows", () => {
		const pending = { ...intent, status: "pending_confirmation" as const };
		expect(permittedBookingActions(admin, pending)).toEqual(["confirm", "propose_alternative", "cancel"]);
		const alternative = { ...intent, status: "alternative_proposed" as const };
		expect(permittedBookingActions(supervisor, alternative)).toEqual(["confirm", "cancel"]);
		const confirmed = { ...intent, status: "confirmed" as const };
		expect(permittedBookingActions(admin, confirmed)).toEqual(["cancel"]);
		const cancelled = { ...intent, status: "cancelled" as const };
		expect(permittedBookingActions(admin, cancelled)).toEqual([]);
	});

	it("lets an agent cancel only their own still-pending intent and nothing else", () => {
		const ownPending = { ...intent, status: "pending_confirmation" as const, createdByUserId: "user-agent" };
		expect(permittedBookingActions(agent, ownPending)).toEqual(["cancel"]);
		const otherPending = { ...intent, status: "pending_confirmation" as const, createdByUserId: "user-other" };
		expect(permittedBookingActions(agent, otherPending)).toEqual([]);
		const ownConfirmed = { ...intent, status: "confirmed" as const, createdByUserId: "user-agent" };
		expect(permittedBookingActions(agent, ownConfirmed)).toEqual([]);
	});

	it("requires an interval for confirm-from-pending and propose, but not confirm-from-alternative or cancel", () => {
		expect(bookingActionNeedsInterval("confirm", "pending_confirmation")).toBe(true);
		expect(bookingActionNeedsInterval("confirm", "alternative_proposed")).toBe(false);
		expect(bookingActionNeedsInterval("propose_alternative", "pending_confirmation")).toBe(true);
		expect(bookingActionNeedsInterval("cancel", "confirmed")).toBe(false);
	});
});

describe("StoreOps in-flight lifecycles (section 7)", () => {
	it("prevents duplicate submission and discards a late response after invalidation", () => {
		const submit = new StoreOpsSubmitLifecycle();
		const first = submit.begin();
		expect(first).toBeTypeOf("number");
		expect(submit.begin()).toBeUndefined();
		expect(submit.busy).toBe(true);
		submit.invalidate();
		expect(submit.complete(first as number)).toBe(false);
		const next = submit.begin();
		expect(submit.complete(next as number)).toBe(true);
		expect(submit.busy).toBe(false);
	});

	it("commits only the latest read so a stale list cannot repaint", () => {
		const read = new StoreOpsReadLifecycle();
		const earlier = read.begin();
		const later = read.begin();
		expect(read.complete(earlier)).toBe(false);
		expect(read.complete(later)).toBe(true);
		read.invalidate();
		expect(read.complete(later)).toBe(false);
	});
});
