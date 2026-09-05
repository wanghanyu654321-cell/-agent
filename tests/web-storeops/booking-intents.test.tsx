import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CreateBookingOutcome, StoreOpsWriteOutcome } from "../../web/src/storeops/api.ts";
import type { StoreOpsActor } from "../../web/src/storeops/authority.ts";
import {
	BookingFeedbackNotice,
	BookingIntentRow,
	BookingIntentsSurface,
	type BookingIntentsState,
} from "../../web/src/storeops/booking-intents.tsx";
import type { BookingIntentDTO } from "../../web/src/storeops/dto.ts";

/**
 * Booking Intents presentation tests (sections 4.4 and 7). Intents are captured, never auto-confirmed, and
 * the only controls rendered are the transitions the contract permits for the current status combined with
 * the actor's server-derived capabilities. Confirm-from-pending and propose-alternative capture an interval;
 * confirm-from-alternative reuses the stored proposal; cancel needs no interval; a cancelled intent is
 * terminal. Duplicate submits and stale responses are handled by the lifecycle (unit-tested separately).
 */

const agent: StoreOpsActor = {
	userId: "user-agent",
	role: "agent",
	capabilities: ["storeops:read", "booking-intent:create"],
};
const supervisor: StoreOpsActor = {
	userId: "user-supervisor",
	role: "supervisor",
	capabilities: ["storeops:read", "availability:write", "booking-intent:create", "booking-intent:manage"],
};
const admin: StoreOpsActor = {
	userId: "user-admin",
	role: "admin",
	capabilities: ["storeops:read", "availability:write", "booking-intent:create", "booking-intent:manage"],
};
const readOnly: StoreOpsActor = { userId: "user-reader", role: "agent", capabilities: ["storeops:read"] };

function intentWith(overrides: Partial<BookingIntentDTO>): BookingIntentDTO {
	return {
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
		...overrides,
	};
}

const noAction = async (): Promise<StoreOpsWriteOutcome<BookingIntentDTO>> => ({ kind: "error", message: "unused" });
const noCreate = async (): Promise<CreateBookingOutcome> => ({ kind: "error", message: "unused" });

function renderRow(intent: BookingIntentDTO, actor: StoreOpsActor): string {
	return renderToStaticMarkup(<BookingIntentRow intent={intent} actor={actor} onAction={noAction} />);
}

describe("BookingIntentRow renders only contract-permitted actions (section 4.4)", () => {
	it("offers a manager confirm/propose/cancel on a pending intent, capturing intervals where required", () => {
		const markup = renderRow(intentWith({ status: "pending_confirmation" }), admin);
		expect(markup).toContain("Confirm");
		expect(markup).toContain("Propose alternative");
		expect(markup).toContain("Cancel intent");
		// confirm-from-pending and propose-alternative each capture a start/end instant
		expect(markup).toContain('type="datetime-local"');
		expect(markup).not.toContain("Terminal");
	});

	it("reuses the stored proposal on confirm-from-alternative without asking for a new interval", () => {
		const markup = renderRow(
			intentWith({
				status: "alternative_proposed",
				alternativeStart: "2026-09-06T05:00:00.000Z",
				alternativeEnd: "2026-09-06T06:00:00.000Z",
			}),
			supervisor,
		);
		expect(markup).toContain("Confirm proposed alternative");
		expect(markup).toContain("Cancel intent");
		expect(markup).not.toContain("Propose alternative");
		expect(markup).not.toContain('type="datetime-local"');
		expect(markup).toContain("Proposed alternative 2026-09-06T05:00:00.000Z");
	});

	it("allows only cancel on a confirmed intent and no action on a terminal cancelled intent", () => {
		const confirmed = renderRow(intentWith({ status: "confirmed" }), admin);
		expect(confirmed).toContain(">Cancel intent<");
		// The status badge reads "Confirmed"; assert on the action button label, not the badge text.
		expect(confirmed).not.toContain(">Confirm<");
		expect(confirmed).not.toContain(">Propose alternative<");

		const cancelled = renderRow(intentWith({ status: "cancelled" }), admin);
		expect(cancelled).toContain("Terminal — no further actions are permitted.");
		expect(cancelled).not.toContain(">Cancel intent<");
	});

	it("lets an agent cancel only their own pending intent, never manage someone else's", () => {
		const own = renderRow(intentWith({ status: "pending_confirmation", createdByUserId: "user-agent" }), agent);
		expect(own).toContain("Cancel intent");
		expect(own).not.toContain("Confirm");

		const other = renderRow(intentWith({ status: "pending_confirmation", createdByUserId: "user-other" }), agent);
		expect(other).toContain("Terminal — no further actions are permitted.");
	});
});

describe("BookingIntentsSurface states and create gating (section 7)", () => {
	it("renders loading, forbidden and an explicit load failure that is not an empty list", () => {
		expect(renderSurface({ status: "loading" }, agent)).toContain("Loading booking intents");
		expect(renderSurface({ status: "forbidden" }, agent)).toContain("not authorized for your current server-derived role");

		const unavailable = renderSurface({ status: "unavailable" }, agent);
		expect(unavailable).toContain("storeops-unavailable");
		expect(unavailable).toContain("This is a load failure, not an empty list.");
	});

	it("renders an empty list distinctly and never implies there is no capacity", () => {
		const empty = renderSurface({ status: "ready", items: [], truncated: false }, agent);
		expect(empty).toContain("storeops-empty");
		expect(empty).toContain("No booking intents were returned. This does not mean there is no capacity.");
		expect(empty).not.toContain("storeops-unavailable");
	});

	it("shows a server-bounded notice when the list is truncated", () => {
		const markup = renderSurface({ status: "ready", items: [intentWith({}), intentWith({ id: "intent-2" })], truncated: true }, admin);
		expect(markup).toContain("Showing the latest 2 intents (server-bounded).");
	});

	it("renders the capture form only for an actor with booking-intent:create and never auto-confirms", () => {
		const withCreate = renderSurface({ status: "ready", items: [], truncated: false }, agent);
		expect(withCreate).toContain("Capture booking intent");
		expect(withCreate).toContain("Capturing an intent does not confirm a booking");
		expect(withCreate).not.toContain("auto-confirm");

		const withoutCreate = renderSurface({ status: "ready", items: [], truncated: false }, readOnly);
		expect(withoutCreate).not.toContain("Capture booking intent");
	});
});

describe("BookingFeedbackNotice distinguishes an idempotent replay from an alert", () => {
	it("renders a duplicate replay as a status note and a conflict as an alert", () => {
		const duplicate = renderToStaticMarkup(
			<BookingFeedbackNotice feedback={{ kind: "duplicate", message: "already recorded (idempotent replay)" }} />,
		);
		expect(duplicate).toContain('role="status"');
		expect(duplicate).toContain("idempotent replay");
		expect(duplicate).not.toContain('role="alert"');

		const conflict = renderToStaticMarkup(
			<BookingFeedbackNotice feedback={{ kind: "conflict", message: "changed elsewhere" }} />,
		);
		expect(conflict).toContain('role="alert"');
		expect(conflict).toContain("storeops-conflict");
	});
});

function renderSurface(state: BookingIntentsState, actor: StoreOpsActor): string {
	return renderToStaticMarkup(
		<BookingIntentsSurface state={state} actor={actor} onAction={noAction} onCreate={noCreate} />,
	);
}
