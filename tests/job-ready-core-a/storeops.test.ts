import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { capabilitiesForRole, createSupportExecutionContext } from "../../src/enterprise/identity.ts";
import {
	parseAvailabilityWrite,
	parseBookingCreate,
	parseBookingTransition,
	resolveTransition,
} from "../../src/storeops/contracts.ts";
import { PostgresStoreOpsRepository, StoreOpsService } from "../../src/storeops/postgres.ts";

describe("StoreOps human workflow contracts", () => {
	it("adds StoreOps capabilities without granting ordinary handoff or audit to agents", () => {
		expect(capabilitiesForRole("agent")).toEqual([
			"agent:invoke",
			"conversation:read",
			"ticket:create",
			"storeops:read",
			"booking-intent:create",
		]);
		expect(capabilitiesForRole("supervisor")).toContain("availability:write");
		expect(capabilitiesForRole("supervisor")).not.toContain("audit:read");
		expect(capabilitiesForRole("admin")).toContain("audit:read");
	});
	it("validates real dates, sorted half-open windows and preserves explicit empty published availability", () => {
		expect(parseAvailabilityWrite("2026-02-28", { expectedVersion: 0, windows: [], status: "published" })).toEqual({
			expectedVersion: 0,
			windows: [],
			status: "published",
		});
		for (const date of ["2026-02-29", "2026-13-01", "2026-2-01"])
			expect(() => parseAvailabilityWrite(date, { expectedVersion: 0, windows: [], status: "published" })).toThrow(
				"invalid_request",
			);
		for (const windows of [
			[{ start: "10:00", end: "09:00" }],
			[
				{ start: "09:00", end: "11:00" },
				{ start: "10:00", end: "12:00" },
			],
			[{ start: "9:00", end: "10:00" }],
		])
			expect(() =>
				parseAvailabilityWrite("2026-02-28", { expectedVersion: 0, windows, status: "published" }),
			).toThrow("invalid_request");
	});
	it("rejects browser authority, automatic confirmation, malformed pairs and oversized service fields", () => {
		const valid = { conversationId: "c", requestedService: "service" };
		for (const extra of [
			{ tenantId: "other" },
			{ customerId: "other" },
			{ role: "admin" },
			{ status: "confirmed" },
			{ requestedStart: "2026-10-01T10:00:00Z" },
			{ requestedService: "x".repeat(201) },
		])
			expect(() => parseBookingCreate({ ...valid, ...extra })).toThrow("invalid_request");
	});
	it("requires explicit pending confirmation, uses the stored alternative and retains cancelled history", () => {
		const times = { start: "2026-10-01T10:00:00.000Z", end: "2026-10-01T11:00:00.000Z" };
		expect(
			resolveTransition(
				"pending_confirmation",
				null,
				null,
				parseBookingTransition({ expectedVersion: 1, action: "confirm", ...times }),
			),
		).toEqual({ status: "confirmed", confirmedStart: times.start, confirmedEnd: times.end });
		expect(
			resolveTransition(
				"alternative_proposed",
				times.start,
				times.end,
				parseBookingTransition({ expectedVersion: 2, action: "confirm" }),
			),
		).toEqual({ status: "confirmed", confirmedStart: times.start, confirmedEnd: times.end });
		expect(
			resolveTransition("confirmed", null, null, parseBookingTransition({ expectedVersion: 2, action: "cancel" })),
		).toEqual({ status: "cancelled" });
		expect(() =>
			resolveTransition(
				"cancelled",
				null,
				null,
				parseBookingTransition({ expectedVersion: 3, action: "confirm", ...times }),
			),
		).toThrow("booking_intent_conflict");
		expect(() =>
			resolveTransition(
				"alternative_proposed",
				times.start,
				times.end,
				parseBookingTransition({ expectedVersion: 2, action: "confirm", ...times }),
			),
		).toThrow("invalid_request");
	});
});

describe("StoreOps failure boundaries without external infrastructure", () => {
	const membership = {
		id: "member",
		userId: "actor",
		tenantId: "tenant",
		storeId: "store",
		role: "agent" as const,
		createdAt: new Date(),
	};
	it("denies agent writes before opening a database connection", async () => {
		const connect = vi.fn();
		const service = new StoreOpsService(new PostgresStoreOpsRepository({ connect } as unknown as Pool), () => "UTC");
		await expect(
			service.putAvailability(createSupportExecutionContext(membership, "r"), "member", "2026-10-01", {
				expectedVersion: 0,
				windows: [],
				status: "published",
			}),
		).rejects.toThrow("forbidden");
		expect(connect).not.toHaveBeenCalled();
	});
	it("does not recover a withheld manage capability from a supervisor role during cancellation", async () => {
		const context = createSupportExecutionContext({ ...membership, role: "supervisor" }, "r");
		context.actor.capabilities = context.actor.capabilities.filter(
			(capability) => capability !== "booking-intent:manage",
		);
		const query = vi.fn(async (sql: string) => ({
			rows: sql.includes("FROM memberships")
				? [{ id: "member", user_id: "actor", role: "supervisor", tenant_id: "tenant", store_id: "store" }]
				: sql.includes("SELECT * FROM booking_intents")
					? [{ id: "intent", created_by_membership_id: "other", status: "pending_confirmation", version: 1 }]
					: [],
		}));
		const service = new StoreOpsService(
			new PostgresStoreOpsRepository({ connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool),
			() => "UTC",
		);
		await expect(
			service.transitionBookingIntent(context, "intent", { expectedVersion: 1, action: "cancel" }),
		).rejects.toThrow("forbidden");
		expect(query.mock.calls.some((call) => call[0].startsWith("UPDATE"))).toBe(false);
	});
	it("rolls back failed operations on the same connection and releases it without committing", async () => {
		const query = vi.fn().mockResolvedValue({ rows: [] }),
			release = vi.fn();
		const repository = new PostgresStoreOpsRepository({
			connect: async () => ({ query, release }),
		} as unknown as Pool);
		await expect(
			repository.transaction(async (client) => {
				await client.query("SELECT 1");
				throw new Error("fixture failure");
			}),
		).rejects.toThrow("fixture failure");
		expect(query.mock.calls.map((call) => call[0])).toEqual(["BEGIN", "SELECT 1", "ROLLBACK"]);
		expect(release).toHaveBeenCalledTimes(1);
	});
	it("rejects stale, foreign, or multiple membership rows before business queries", async () => {
		const current = { id: "member", user_id: "actor", tenant_id: "tenant", store_id: "store", role: "agent" };
		for (const rows of [
			[],
			[current, current],
			[{ ...current, store_id: "foreign" }],
			[{ ...current, role: "supervisor" }],
		]) {
			const query = vi.fn(async (sql: string) => ({ rows: sql.startsWith("SELECT") ? rows : [] })),
				release = vi.fn();
			const service = new StoreOpsService(
				new PostgresStoreOpsRepository({ connect: async () => ({ query, release }) } as unknown as Pool),
				() => "UTC",
			);
			await expect(service.listBookingIntents(createSupportExecutionContext(membership, "r"))).rejects.toThrow(
				"forbidden",
			);
			expect(query.mock.calls.some((call) => call[0].includes("booking_intents"))).toBe(false);
			expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
			expect(release).toHaveBeenCalledTimes(1);
		}
	});
});
