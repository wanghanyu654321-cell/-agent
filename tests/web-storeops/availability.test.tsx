import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StoreOpsActor } from "../../web/src/storeops/authority.ts";
import {
	AvailabilityFeedbackNotice,
	AvailabilityRowSurface,
	type AvailabilityState,
	deriveAvailabilityRow,
	TodayAvailabilitySurface,
} from "../../web/src/storeops/availability.tsx";
import type { AvailabilityBoardDTO, AvailabilityDTO } from "../../web/src/storeops/dto.ts";

/**
 * Today Availability presentation tests (sections 4.3 and 7). The core contract requirement is that an
 * unknown day (a staff row that was never recorded, or was withdrawn) is visually and textually distinct
 * from an explicit "no listed window", from an available row, and from a view-level load failure that must
 * never be rendered as an empty day. These render the pure surfaces with renderToStaticMarkup, matching the
 * repository's existing frontend test approach (no jsdom, no interaction).
 */

const supervisor: StoreOpsActor = {
	userId: "user-supervisor",
	role: "supervisor",
	capabilities: ["storeops:read", "availability:write"],
};

function row(staffMembershipId: string, overrides: Partial<AvailabilityDTO>): AvailabilityDTO {
	return {
		id: `avail-${staffMembershipId}`,
		staffMembershipId,
		staffDisplayName: staffMembershipId,
		localDate: "2026-09-05",
		timeZone: "Asia/Shanghai",
		windows: [{ start: "09:00", end: "12:00" }],
		status: "published",
		source: "human",
		version: 1,
		updatedAt: "2026-09-05T01:00:00.000Z",
		...overrides,
	};
}

describe("deriveAvailabilityRow (section 4.3)", () => {
	const published = row("member-1", {});
	const publishedEmpty = row("member-2", { windows: [] });
	const withdrawn = row("member-3", { status: "withdrawn" });
	const items = [published, publishedEmpty, withdrawn];

	it("maps a missing row to unknown/not_recorded and a withdrawn row to unknown/withdrawn", () => {
		expect(deriveAvailabilityRow(items, "member-absent", "2026-09-05")).toEqual({
			rowState: "unknown",
			reason: "not_recorded",
		});
		expect(deriveAvailabilityRow(items, "member-3", "2026-09-05")).toEqual({
			rowState: "unknown",
			item: withdrawn,
			reason: "withdrawn",
		});
	});

	it("maps a published empty array to no_window and published windows to available", () => {
		expect(deriveAvailabilityRow(items, "member-2", "2026-09-05").rowState).toBe("no_window");
		expect(deriveAvailabilityRow(items, "member-1", "2026-09-05").rowState).toBe("available");
	});

	it("does not match a row recorded for a different local date", () => {
		expect(deriveAvailabilityRow(items, "member-1", "2026-09-06")).toEqual({
			rowState: "unknown",
			reason: "not_recorded",
		});
	});
});

describe("AvailabilityRowSurface keeps unknown distinct from no-window and available", () => {
	it("renders the three row states with distinct labels and classes", () => {
		const unknown = renderToStaticMarkup(
			<AvailabilityRowSurface displayName="Ava" row={{ rowState: "unknown", reason: "not_recorded" }} />,
		);
		expect(unknown).toContain("state-unknown");
		expect(unknown).toContain("storeops-avail-unknown");
		expect(unknown).toContain("Unknown — not recorded");
		expect(unknown).not.toContain("Available");

		const withdrawn = renderToStaticMarkup(
			<AvailabilityRowSurface displayName="Ava" row={{ rowState: "unknown", reason: "withdrawn" }} />,
		);
		expect(withdrawn).toContain("Unknown — withdrawn");

		const none = renderToStaticMarkup(<AvailabilityRowSurface displayName="Bo" row={{ rowState: "no_window" }} />);
		expect(none).toContain("state-no-window");
		expect(none).toContain("No listed window");
		expect(none).not.toContain("Unknown");

		const open = renderToStaticMarkup(
			<AvailabilityRowSurface
				displayName="Cy"
				row={{ rowState: "available", item: row("member-1", { windows: [{ start: "09:00", end: "12:00" }] }) }}
			/>,
		);
		expect(open).toContain("state-available");
		expect(open).toContain("storeops-avail-open");
		expect(open).toContain("09:00");
		expect(open).toContain("12:00");
	});
});

describe("TodayAvailabilitySurface view states (section 7)", () => {
	it("renders loading, forbidden and an explicit load failure that is not an empty day", () => {
		expect(renderSurface({ status: "loading" })).toContain("Loading today");
		expect(renderSurface({ status: "forbidden" })).toContain("not authorized for your current server-derived role");

		const unavailable = renderSurface({ status: "unavailable" });
		expect(unavailable).toContain("storeops-unavailable");
		expect(unavailable).toContain("This is a load failure, not an empty day.");
		expect(unavailable).not.toContain("No staff are recorded");
	});

	it("renders an in-scope empty roster distinctly from a load failure", () => {
		const empty = renderSurface({
			status: "ready",
			date: "2026-09-05",
			board: { items: [], staff: [], timeZone: "Asia/Shanghai" },
		});
		expect(empty).toContain("storeops-empty");
		expect(empty).toContain("No staff are recorded in this scope for 2026-09-05.");
		expect(empty).not.toContain("storeops-unavailable");
	});

	it("renders a full board where all four row states stay visually distinct", () => {
		const board: AvailabilityBoardDTO = {
			timeZone: "Asia/Shanghai",
			staff: [
				{ membershipId: "member-1", displayName: "Ava" },
				{ membershipId: "member-2", displayName: "Bo" },
				{ membershipId: "member-3", displayName: "Cy" },
				{ membershipId: "member-4", displayName: "Di" },
			],
			items: [
				row("member-1", { staffDisplayName: "Ava" }),
				row("member-2", { staffDisplayName: "Bo", windows: [] }),
				row("member-3", { staffDisplayName: "Cy", status: "withdrawn" }),
			],
		};
		const markup = renderSurface({ status: "ready", date: "2026-09-05", board });
		expect(markup).toContain('data-time-zone="Asia/Shanghai"');
		expect(markup).toContain("Unknown — not recorded"); // member-4 never recorded
		expect(markup).toContain("Unknown — withdrawn"); // member-3
		expect(markup).toContain("No listed window"); // member-2
		expect(markup).toContain("storeops-avail-open"); // member-1
	});
});

describe("AvailabilityFeedbackNotice (section 7 write outcomes)", () => {
	it("renders nothing when idle and a conflict as an alert distinct from a forbidden notice", () => {
		expect(renderToStaticMarkup(<AvailabilityFeedbackNotice feedback={{ kind: "idle" }} />)).toBe("");
		const conflict = renderToStaticMarkup(
			<AvailabilityFeedbackNotice feedback={{ kind: "conflict", message: "changed elsewhere" }} />,
		);
		expect(conflict).toContain('role="alert"');
		expect(conflict).toContain("storeops-conflict");
		const forbidden = renderToStaticMarkup(
			<AvailabilityFeedbackNotice feedback={{ kind: "forbidden", message: "not authorized" }} />,
		);
		expect(forbidden).toContain('role="status"');
		expect(forbidden).not.toContain('role="alert"');
	});
});

function renderSurface(state: AvailabilityState): string {
	return renderToStaticMarkup(<TodayAvailabilitySurface state={state} actor={supervisor} />);
}
