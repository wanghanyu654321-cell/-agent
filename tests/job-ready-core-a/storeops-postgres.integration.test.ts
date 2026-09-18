import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedPortfolioEnterpriseDemoData } from "../../src/enterprise/demo-data.ts";
import { createSupportExecutionContext, type SupportExecutionContext } from "../../src/enterprise/identity.ts";
import { applyEnterpriseBusinessMigrations, PostgresIdentityRepository } from "../../src/enterprise/postgres.ts";
import { PostgresStoreOpsRepository, StoreOpsService } from "../../src/storeops/postgres.ts";

const connectionString = process.env.POSTGRES_TEST_URL;
describe.skipIf(!connectionString)("StoreOps real PostgreSQL boundaries", () => {
	const schema = `storeops_${randomUUID().replaceAll("-", "")}`;
	const admin = new Pool({ connectionString });
	const pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
	const service = new StoreOpsService(new PostgresStoreOpsRepository(pool), () => "Asia/Shanghai");
	let alice: SupportExecutionContext, susan: SupportExecutionContext, bob: SupportExecutionContext;
	beforeAll(async () => {
		await admin.query(`CREATE SCHEMA ${schema}`);
		await applyEnterpriseBusinessMigrations(pool);
		const sql = await readFile(new URL("../../migrations/003_job_ready_storeops.sql", import.meta.url), "utf8");
		await new PostgresStoreOpsRepository(pool).transaction(async (client) => {
			await client.query(sql);
		});
		const identity = new PostgresIdentityRepository(pool);
		const demo = await seedPortfolioEnterpriseDemoData(identity);
		alice = createSupportExecutionContext((await identity.listMembershipsForUser(demo.users.alice.id))[0]!, "a");
		susan = createSupportExecutionContext((await identity.listMembershipsForUser(demo.users.susan.id))[0]!, "s");
		bob = createSupportExecutionContext((await identity.listMembershipsForUser(demo.users.bob.id))[0]!, "b");
		for (const [id, context] of [
			["a", alice],
			["b", bob],
		] as const)
			await pool.query(
				"INSERT INTO conversations(id,tenant_id,store_id,customer_id,created_at,updated_at) VALUES($1,$2,$3,$4,NOW(),NOW())",
				[id, context.scope.tenantId, context.scope.storeId, `customer-${id}`],
			);
	});
	beforeEach(async () => {
		await pool.query(
			"TRUNCATE booking_intents,daily_availability,wecom_inbound_messages,channel_bindings,handoffs,audit_events",
		);
	});
	afterAll(async () => {
		await pool.end();
		await admin.query(`DROP SCHEMA ${schema} CASCADE`);
		await admin.end();
	});
	const create = { conversationId: "a", requestedService: "Fixture service" };
	const interval = { start: "2026-10-01T10:00:00Z", end: "2026-10-01T11:00:00Z" };

	it("keeps missing availability unknown, supports human empty publication, and serializes version races", async () => {
		expect((await service.listAvailability(alice, "2026-10-01")).items).toEqual([]);
		await expect(
			service.putAvailability(alice, "demo-membership-alice-a1", "2026-10-01", {
				expectedVersion: 0,
				windows: [],
				status: "published",
			}),
		).rejects.toThrow("forbidden");
		const result = await service.putAvailability(susan, "demo-membership-alice-a1", "2026-10-01", {
			expectedVersion: 0,
			windows: [],
			status: "published",
		});
		expect(result).toMatchObject({
			windows: [],
			status: "published",
			version: 1,
			source: "human",
			timeZone: "Asia/Shanghai",
		});
		const races = await Promise.allSettled(
			[1, 2].map(() =>
				service.putAvailability(susan, "demo-membership-alice-a1", "2026-10-01", {
					expectedVersion: 1,
					windows: [{ start: "10:00", end: "11:00" }],
					status: "withdrawn",
				}),
			),
		);
		expect(races.filter((item) => item.status === "fulfilled")).toHaveLength(1);
		expect(races.filter((item) => item.status === "rejected")).toHaveLength(1);
		expect((await service.listAvailability(alice, "2026-10-01")).items[0]).toMatchObject({
			version: 2,
			status: "withdrawn",
		});
		expect((await service.listAvailability(bob, "2026-10-01")).items).toEqual([]);
	});
	it("rejects cross-scope staff and unconfigured timezone before writing", async () => {
		await expect(
			service.putAvailability(susan, "demo-membership-bob-b1", "2026-10-01", {
				expectedVersion: 0,
				windows: [],
				status: "published",
			}),
		).rejects.toThrow("not_found");
		const unavailable = new StoreOpsService(new PostgresStoreOpsRepository(pool), () => undefined);
		await expect(
			unavailable.putAvailability(susan, "demo-membership-alice-a1", "2026-10-01", {
				expectedVersion: 0,
				windows: [],
				status: "published",
			}),
		).rejects.toThrow("dependency_unavailable");
		expect((await pool.query("SELECT count(*)::text AS count FROM daily_availability")).rows[0].count).toBe("0");
	});
	it("creates only pending intent, derives customer, and persists exactly one concurrent idempotent row", async () => {
		const results = await Promise.all([
			service.createBookingIntent(alice, "duplicate", create),
			service.createBookingIntent(alice, "duplicate", create),
		]);
		expect(results.filter((item) => !item.duplicate)).toHaveLength(1);
		expect(results[0].intent).toMatchObject({
			status: "pending_confirmation",
			customerId: "customer-a",
			createdByUserId: alice.actor.userId,
			version: 1,
		});
		expect((await pool.query("SELECT count(*)::text AS count FROM booking_intents")).rows[0].count).toBe("1");
		await expect(
			service.createBookingIntent(alice, "duplicate", { ...create, requestedService: "changed" }),
		).rejects.toThrow("booking_intent_conflict");
		await expect(service.createBookingIntent(susan, "duplicate", create)).rejects.toThrow("booking_intent_conflict");
		expect((await service.listBookingIntents(bob)).items).toEqual([]);
		await expect(service.createBookingIntent(bob, "foreign", create)).rejects.toThrow("not_found");
		await expect(
			service.createBookingIntent(alice, "foreignstaff", {
				...create,
				preferredStaffMembershipId: "demo-membership-bob-b1",
			}),
		).rejects.toThrow("not_found");
	});
	it("only a human manager confirms; creator can cancel own pending but cannot cancel another person's intent", async () => {
		const { intent } = await service.createBookingIntent(alice, "manage", create);
		await expect(
			service.transitionBookingIntent(alice, intent.id, { expectedVersion: 1, action: "confirm", ...interval }),
		).rejects.toThrow("forbidden");
		const confirmed = await service.transitionBookingIntent(susan, intent.id, {
			expectedVersion: 1,
			action: "confirm",
			...interval,
		});
		expect(confirmed).toMatchObject({ status: "confirmed", confirmedStart: "2026-10-01T10:00:00.000Z", version: 2 });
		await expect(
			service.transitionBookingIntent(alice, intent.id, { expectedVersion: 2, action: "cancel" }),
		).rejects.toThrow("forbidden");
		const cancelled = await service.transitionBookingIntent(susan, intent.id, {
			expectedVersion: 2,
			action: "cancel",
		});
		expect(cancelled.confirmedStart).toBe(confirmed.confirmedStart);
		await expect(
			service.transitionBookingIntent(susan, intent.id, { expectedVersion: 3, action: "confirm", ...interval }),
		).rejects.toThrow("booking_intent_conflict");
		const own = await service.createBookingIntent(alice, "own", create);
		expect(
			(await service.transitionBookingIntent(alice, own.intent.id, { expectedVersion: 1, action: "cancel" })).status,
		).toBe("cancelled");
		const other = await service.createBookingIntent(susan, "other", create);
		await expect(
			service.transitionBookingIntent(alice, other.intent.id, { expectedVersion: 1, action: "cancel" }),
		).rejects.toThrow("forbidden");
	});
	it("preserves alternatives and permits exactly one racing transition", async () => {
		const { intent } = await service.createBookingIntent(alice, "alternative", create);
		const outcomes = await Promise.allSettled(
			[1, 2].map(() =>
				service.transitionBookingIntent(susan, intent.id, {
					expectedVersion: 1,
					action: "propose_alternative",
					...interval,
				}),
			),
		);
		expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(1);
		expect(outcomes.filter((item) => item.status === "rejected")).toHaveLength(1);
		expect(
			await service.transitionBookingIntent(susan, intent.id, { expectedVersion: 2, action: "confirm" }),
		).toMatchObject({
			status: "confirmed",
			alternativeStart: "2026-10-01T10:00:00.000Z",
			confirmedStart: "2026-10-01T10:00:00.000Z",
		});
	});
	it("PostgreSQL rejects cross-scope ownership independently of service validation", async () => {
		const { intent } = await service.createBookingIntent(alice, "fk", create);
		for (const [column, value] of [
			["conversation_id", "b"],
			["customer_id", "customer-b"],
			["created_by_membership_id", "demo-membership-bob-b1"],
			["preferred_staff_membership_id", "demo-membership-bob-b1"],
		]) {
			await expect(
				pool.query(`UPDATE booking_intents SET ${column}=$1 WHERE id=$2`, [value, intent.id]),
			).rejects.toMatchObject({ code: "23503" });
		}
		await expect(
			pool.query(
				"INSERT INTO channel_bindings(id,tenant_id,store_id,corp_id,application_id,external_subject_id,membership_id,status,version,created_at,updated_at) VALUES('cross',$1,$2,'fixture','fixture','fixture','demo-membership-bob-b1','active',1,NOW(),NOW())",
				[alice.scope.tenantId, alice.scope.storeId],
			),
		).rejects.toMatchObject({ code: "23503" });
	});
	it("projects latest fallback and durable handoff without raw audit; agents denied; scope isolated", async () => {
		const audit = async (id: string, context: SupportExecutionContext, outcome: string, created: string) =>
			pool.query(
				"INSERT INTO audit_events(tenant_id,store_id,conversation_id,event_type,payload,created_at) VALUES($1,$2,$3,'support-agent.audit',$4::jsonb,$5)",
				[
					context.scope.tenantId,
					context.scope.storeId,
					id,
					JSON.stringify({ outcome, privateDiagnostic: "must-not-leak" }),
					created,
				],
			);
		await audit("a", alice, "fallback", "2026-10-01T00:00:00Z");
		await audit("b", bob, "fallback", "2026-10-01T00:00:00Z");
		await expect(service.listNeedsAttention(alice)).rejects.toThrow("forbidden");
		expect((await service.listNeedsAttention(susan)).items).toEqual([
			{ conversationId: "a", basis: "fallback", handoffId: null, lastActivityAt: expect.any(String) },
		]);
		await audit("a", alice, "answer", "2026-10-02T00:00:00Z");
		expect((await service.listNeedsAttention(susan)).items).toEqual([]);
		await pool.query(
			"INSERT INTO handoffs(tenant_id,store_id,conversation_id,reason,created_at) VALUES($1,$2,'a','private reason',NOW())",
			[alice.scope.tenantId, alice.scope.storeId],
		);
		const projection = await service.listNeedsAttention(susan);
		expect(projection.items).toEqual([
			{
				conversationId: "a",
				basis: "durable_handoff",
				handoffId: expect.any(String),
				lastActivityAt: expect.any(String),
			},
		]);
		expect(JSON.stringify(projection)).not.toContain("private");
	});
	it("reads intents after service reconstruction and rejects stale database authority", async () => {
		await service.createBookingIntent(alice, "restore", create);
		const recreated = new StoreOpsService(new PostgresStoreOpsRepository(pool), () => "Asia/Shanghai");
		expect((await recreated.listBookingIntents(alice)).items).toHaveLength(1);
		await pool.query("UPDATE memberships SET role='agent' WHERE id='demo-membership-susan-a1'");
		try {
			await expect(recreated.listNeedsAttention(susan)).rejects.toThrow("forbidden");
		} finally {
			await pool.query("UPDATE memberships SET role='supervisor' WHERE id='demo-membership-susan-a1'");
		}
	});
});
