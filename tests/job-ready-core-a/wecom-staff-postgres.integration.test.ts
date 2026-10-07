import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PostgresWeComCustomerRepository } from "../../src/channels/wecom/customer.ts";
import { provisionStaffBinding, WeComStaffService } from "../../src/channels/wecom/staff.ts";
import type { StaffApi, StaffConfig, StaffEvent } from "../../src/channels/wecom/staff-protocol.ts";
import { seedPortfolioEnterpriseDemoData } from "../../src/enterprise/demo-data.ts";
import { createSupportExecutionContext, type SupportExecutionContext } from "../../src/enterprise/identity.ts";
import { PostgresIdentityRepository } from "../../src/enterprise/postgres.ts";
import { PostgresStoreOpsRepository, StoreOpsService } from "../../src/storeops/postgres.ts";

const connectionString = process.env.POSTGRES_TEST_URL;
describe.skipIf(!connectionString)("Staff template cards real PostgreSQL authority and durability", () => {
	const schema = `staff_${randomUUID().replaceAll("-", "")}`;
	const admin = new Pool({ connectionString });
	const pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
	const config: StaffConfig = {
		corpId: "fixture-corp",
		agentId: "100002",
		appSecret: "fixture-only",
		token: "fixture-token",
		encodingAesKey: Buffer.alloc(32, 7).toString("base64").replace(/=$/, ""),
	};
	const storeops = new StoreOpsService(new PostgresStoreOpsRepository(pool), () => "Asia/Shanghai");
	const api = {
		sendCard: vi.fn<StaffApi["sendCard"]>().mockResolvedValue("accepted"),
		updateCard: vi.fn<StaffApi["updateCard"]>().mockResolvedValue("accepted"),
	};
	const customer = { sendTextMessage: vi.fn(async () => {}) };
	let alice: SupportExecutionContext, susan: SupportExecutionContext;
	let service: WeComStaffService;
	beforeAll(async () => {
		await admin.query(`CREATE SCHEMA ${schema}`);
		for (const name of [
			"001_enterprise_identity.sql",
			"002_support_business_persistence.sql",
			"003_job_ready_storeops.sql",
			"006_wecom_customer_identity.sql",
			"007_wecom_staff_booking.sql",
		])
			await pool.query(readFileSync(new URL(`../../migrations/${name}`, import.meta.url), "utf8"));
		const identity = new PostgresIdentityRepository(pool);
		const demo = await seedPortfolioEnterpriseDemoData(identity);
		alice = createSupportExecutionContext(
			(await identity.listMembershipsForUser(demo.users.alice.id))[0]!,
			"alice-request",
		);
		susan = createSupportExecutionContext(
			(await identity.listMembershipsForUser(demo.users.susan.id))[0]!,
			"susan-request",
		);
		await pool.query(
			"INSERT INTO conversations(id,tenant_id,store_id,customer_id,created_at,updated_at) VALUES('conversation-a',$1,$2,'customer-a',NOW(),NOW())",
			[alice.scope.tenantId, alice.scope.storeId],
		);
	});
	beforeEach(async () => {
		await pool.query(
			"TRUNCATE wecom_staff_booking_notifications,booking_intents,channel_bindings,wecom_kf_channels CASCADE",
		);
		vi.clearAllMocks();
		api.sendCard.mockReset().mockResolvedValue("accepted");
		api.updateCard.mockReset().mockResolvedValue("accepted");
		customer.sendTextMessage.mockReset().mockResolvedValue(undefined);
		service = new WeComStaffService(pool, config, api, customer);
		await bind("staff-susan", "demo-membership-susan-a1");
	});
	afterAll(async () => {
		await pool.end();
		await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
		await admin.end();
	});
	function bind(userId: string, membershipId: string) {
		return provisionStaffBinding(pool, { corpId: config.corpId, agentId: config.agentId, userId, membershipId });
	}
	async function booking(extra: Record<string, unknown> = {}) {
		return (
			await storeops.createBookingIntent(alice, randomUUID(), {
				conversationId: "conversation-a",
				requestedService: "Synthetic service",
				requestedStart: "2026-10-01T10:00:00Z",
				requestedEnd: "2026-10-01T11:00:00Z",
				...extra,
			})
		).intent;
	}
	async function notified(extra: Record<string, unknown> = {}) {
		const intent = await booking(extra);
		const sent = await service.notify(alice, intent.id);
		expect(sent.status).toBe("accepted");
		expect(sent.taskId).toEqual(expect.any(String));
		return {
			intent,
			event: {
				taskId: sent.taskId!,
				agentId: config.agentId,
				userId: "staff-susan",
				eventKey: "booking_confirm",
				responseCode: "synthetic-one-use-code",
			} satisfies StaffEvent,
		};
	}
	async function row(id: string) {
		return (
			await pool.query(
				"SELECT status,version,updated_by_membership_id,channel_binding_id FROM booking_intents WHERE id=$1",
				[id],
			)
		).rows[0];
	}

	it.each([
		["booking_confirm", "confirmed"],
		["booking_cancel", "cancelled"],
	] as const)("%s commits %s with the bound staff membership", async (eventKey, status) => {
		const { intent, event } = await notified();
		expect(await service.handle({ ...event, eventKey })).toMatchObject({ status });
		expect(await row(intent.id)).toMatchObject({
			status,
			version: 2,
			updated_by_membership_id: "demo-membership-susan-a1",
		});
		expect(api.updateCard).toHaveBeenCalledTimes(1);
	});
	it("durably deduplicates concurrent callbacks and rejects a different action on the same task", async () => {
		const { intent, event } = await notified();
		const results = await Promise.all([
			service.handle(event),
			new WeComStaffService(pool, config, api, customer).handle(event),
		]);
		expect(results.map((result) => result.status).sort()).toEqual(["confirmed", "duplicate"]);
		expect(await row(intent.id)).toMatchObject({ status: "confirmed", version: 2 });
		await expect(service.handle({ ...event, eventKey: "booking_cancel" })).rejects.toMatchObject({
			code: "booking_intent_conflict",
		});
		expect(await row(intent.id)).toMatchObject({ status: "confirmed", version: 2 });
	});
	it("uses the notification expectedVersion rather than the current row version", async () => {
		const { intent, event } = await notified();
		await storeops.transitionBookingIntent(susan, intent.id, { expectedVersion: 1, action: "cancel" });
		expect(await service.handle(event)).toMatchObject({ status: "booking_intent_conflict" });
		expect(await row(intent.id)).toMatchObject({ status: "cancelled", version: 2 });
	});
	it.each(["unknown", "disabled", "no-manage", "cross-store", "wrong-agent"])(
		"rejects %s staff without changing the booking",
		async (reason) => {
			const { intent, event } = await notified();
			if (reason === "unknown") event.userId = "unknown";
			if (reason === "disabled")
				await pool.query("UPDATE channel_bindings SET status='disabled' WHERE external_subject_id='staff-susan'");
			if (reason === "no-manage") {
				await bind("staff-alice", "demo-membership-alice-a1");
				event.userId = "staff-alice";
			}
			if (reason === "cross-store") {
				await pool.query("UPDATE memberships SET role='supervisor' WHERE id='demo-membership-bob-b1'");
				await bind("staff-bob", "demo-membership-bob-b1");
				event.userId = "staff-bob";
			}
			if (reason === "wrong-agent") event.agentId = "100003";
			try {
				await expect(service.handle(event)).rejects.toThrow(reason === "cross-store" ? "not_found" : undefined);
			} finally {
				if (reason === "cross-store")
					await pool.query("UPDATE memberships SET role='agent' WHERE id='demo-membership-bob-b1'");
			}
			expect(await row(intent.id)).toMatchObject({ status: "pending_confirmation", version: 1 });
			expect(api.updateCard).not.toHaveBeenCalled();
		},
	);
	it("does not grant cancel authority to the customer-side agent", async () => {
		const { intent, event } = await notified();
		await bind("staff-alice", "demo-membership-alice-a1");
		await expect(service.handle({ ...event, userId: "staff-alice", eventKey: "booking_cancel" })).rejects.toThrow();
		expect(await row(intent.id)).toMatchObject({ status: "pending_confirmation", version: 1 });
	});
	it("commits the transition even when staff feedback delivery fails", async () => {
		const { intent, event } = await notified();
		api.updateCard.mockRejectedValueOnce(new Error("synthetic transport failure"));
		expect(await service.handle(event)).toMatchObject({ status: "confirmed" });
		expect(await row(intent.id)).toMatchObject({ status: "confirmed", version: 2 });
		expect(await service.handle(event)).toMatchObject({ status: "duplicate" });
	});
	it("fails closed on missing or ambiguous recipients and selects an authorized preferred staff", async () => {
		await pool.query("UPDATE channel_bindings SET status='disabled'");
		expect(await service.notify(alice, (await booking()).id)).toMatchObject({ status: "unavailable" });
		await pool.query("UPDATE channel_bindings SET status='active'");
		await bind("staff-ava", "demo-membership-ava-a1");
		expect(await service.notify(alice, (await booking()).id)).toMatchObject({ status: "unavailable" });
		await notified({ preferredStaffMembershipId: "demo-membership-susan-a1" });
		expect(api.sendCard).toHaveBeenCalledTimes(1);
		expect(api.sendCard.mock.calls[0]?.[0]).toMatchObject({ userId: "staff-susan" });
	});
	it("records uncertain notification delivery without changing pending intent or automatically retrying", async () => {
		const intent = await booking();
		api.sendCard.mockRejectedValueOnce(new Error("synthetic transport failure"));
		expect(await service.notify(alice, intent.id)).toMatchObject({ status: "indeterminate" });
		expect(await row(intent.id)).toMatchObject({ status: "pending_confirmation", version: 1 });
		expect(await service.notify(alice, intent.id)).toMatchObject({ status: "duplicate" });
		expect(api.sendCard).toHaveBeenCalledTimes(1);
	});
	it("provisions bindings idempotently and refuses silent membership reassignment", async () => {
		const id = await bind("staff-susan", "demo-membership-susan-a1");
		expect(await bind("staff-susan", "demo-membership-susan-a1")).toBe(id);
		await expect(bind("staff-susan", "demo-membership-ava-a1")).rejects.toThrow();
	});
	it("operator CLI provisions once and refuses reassignment without leaking operator inputs", async () => {
		const url = new URL(connectionString!);
		url.searchParams.set("options", `-c search_path=${schema}`);
		const run = (membershipId: string) =>
			promisify(execFile)(
				process.execPath,
				[
					"--no-warnings",
					"--experimental-transform-types",
					"scripts/provision-wecom-staff.ts",
					"--corp-id",
					config.corpId,
					"--agent-id",
					config.agentId,
					"--user-id",
					"cli-staff",
					"--membership-id",
					membershipId,
				],
				{ env: { ...process.env, DATABASE_URL: url.toString() } },
			);
		const first = JSON.parse((await run("demo-membership-susan-a1")).stdout);
		expect(first).toMatchObject({ status: "provisioned", bindingId: expect.any(String) });
		expect(JSON.parse((await run("demo-membership-susan-a1")).stdout)).toEqual(first);
		try {
			await run("demo-membership-ava-a1");
			throw new Error("reassignment must fail");
		} catch (error: any) {
			expect(error.code).toBe(1);
			expect(JSON.parse(error.stderr)).toEqual({ error: "forbidden" });
		}
		expect(
			(await pool.query("SELECT membership_id FROM channel_bindings WHERE external_subject_id='cli-staff'")).rows,
		).toEqual([{ membership_id: "demo-membership-susan-a1" }]);
	});
	it("still delivers customer feedback when the postcommit staff state update fails", async () => {
		await pool.query(
			"INSERT INTO wecom_kf_channels(id,corp_id,open_kfid,tenant_id,store_id,authority_membership_id,status,version,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'demo-membership-alice-a1','active',1,NOW(),NOW())",
			[randomUUID(), config.corpId, "wk-fixture", alice.scope.tenantId, alice.scope.storeId],
		);
		const route = await new PostgresWeComCustomerRepository(pool).resolveRoute(
			{
				corpId: config.corpId,
				openKfId: "wk-fixture",
				externalUserId: "wm-fixture",
				messageId: randomUUID(),
				sentAtUnix: 1_726_700_000,
				text: "synthetic booking",
			},
			randomUUID(),
		);
		const { intent, event } = await notified({ conversationId: route!.conversationId });
		await pool.query(`CREATE FUNCTION fail_feedback_update() RETURNS trigger LANGUAGE plpgsql AS $$
			BEGIN IF OLD.feedback_state='indeterminate' AND NEW.feedback_state='accepted' THEN
				RAISE EXCEPTION 'synthetic feedback persistence failure'; END IF; RETURN NEW; END $$`);
		await pool.query(`CREATE TRIGGER fail_feedback_update BEFORE UPDATE ON wecom_staff_booking_notifications
			FOR EACH ROW EXECUTE FUNCTION fail_feedback_update()`);
		try {
			expect(await service.handle(event)).toEqual({ status: "confirmed" });
			expect(await row(intent.id)).toMatchObject({ status: "confirmed", version: 2 });
			expect(customer.sendTextMessage).toHaveBeenCalledTimes(1);
			expect(
				(
					await pool.query(
						"SELECT feedback_state,customer_delivery_state FROM wecom_staff_booking_notifications WHERE task_id=$1",
						[event.taskId],
					)
				).rows,
			).toEqual([{ feedback_state: "indeterminate", customer_delivery_state: "accepted" }]);
			expect(await service.handle(event)).toEqual({ status: "duplicate" });
			expect(api.updateCard).toHaveBeenCalledTimes(1);
			expect(customer.sendTextMessage).toHaveBeenCalledTimes(1);
		} finally {
			await pool.query("DROP TRIGGER fail_feedback_update ON wecom_staff_booking_notifications");
			await pool.query("DROP FUNCTION fail_feedback_update()");
		}
	});
	it("supports live KF customers with no legacy binding and preserves commit on customer outbound failure", async () => {
		await pool.query(
			"INSERT INTO wecom_kf_channels(id,corp_id,open_kfid,tenant_id,store_id,authority_membership_id,status,version,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'demo-membership-alice-a1','active',1,NOW(),NOW())",
			[randomUUID(), config.corpId, "wk-fixture", alice.scope.tenantId, alice.scope.storeId],
		);
		const route = await new PostgresWeComCustomerRepository(pool).resolveRoute(
			{
				corpId: config.corpId,
				openKfId: "wk-fixture",
				externalUserId: "wm-fixture",
				messageId: randomUUID(),
				sentAtUnix: 1_726_700_000,
				text: "synthetic booking",
			},
			randomUUID(),
		);
		expect(route).toBeDefined();
		const { intent, event } = await notified({ conversationId: route!.conversationId });
		expect((await row(intent.id)).channel_binding_id).toBeNull();
		customer.sendTextMessage.mockRejectedValueOnce(new Error("synthetic customer transport failure"));
		expect(await service.handle(event)).toMatchObject({ status: "confirmed" });
		expect(customer.sendTextMessage).toHaveBeenCalledTimes(1);
		expect(await row(intent.id)).toMatchObject({ status: "confirmed", version: 2 });
		expect(await service.handle(event)).toMatchObject({ status: "duplicate" });
		expect(customer.sendTextMessage).toHaveBeenCalledTimes(1);
	});
});
