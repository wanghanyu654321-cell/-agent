import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
	type VerifiedWeComText,
	WeComCore,
	type WeComCoreOptions,
	weComPayloadHash,
} from "../../src/channels/wecom/core.ts";
import { PostgresWeComRepository } from "../../src/channels/wecom/postgres.ts";
import { seedPortfolioEnterpriseDemoData } from "../../src/enterprise/demo-data.ts";
import { PostgresIdentityRepository } from "../../src/enterprise/postgres.ts";

const databaseUrl = process.env.POSTGRES_TEST_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres("WeCom real PostgreSQL isolation and durable deduplication", () => {
	const schema = `wecom_core_${randomUUID().replaceAll("-", "")}`;
	const administrator = new Pool({ connectionString: databaseUrl });
	const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
	const repository = new PostgresWeComRepository(pool);
	let demo: Awaited<ReturnType<typeof seedPortfolioEnterpriseDemoData>>;
	const message: VerifiedWeComText = {
		corpId: "fixture-corp",
		applicationId: "fixture-app",
		externalSubjectId: "alice-fixture",
		messageId: "unused",
		sentAt: "2026-09-05T00:00:00.000Z",
		text: "synthetic internal-member request",
	};
	beforeAll(async () => {
		await administrator.query(`CREATE SCHEMA ${schema}`);
		for (const filename of [
			"001_enterprise_identity.sql",
			"002_support_business_persistence.sql",
			"003_job_ready_storeops.sql",
		])
			await pool.query(readFileSync(new URL(`../../migrations/${filename}`, import.meta.url), "utf8"));
		demo = await seedPortfolioEnterpriseDemoData(new PostgresIdentityRepository(pool));
		for (const [binding, subject, membership, tenant, store] of [
			["binding-a", "alice-fixture", "demo-membership-alice-a1", demo.tenants.a.id, demo.stores.a1.id],
			["binding-b", "bob-fixture", "demo-membership-bob-b1", demo.tenants.b.id, demo.stores.b1.id],
		])
			await pool.query(
				"INSERT INTO channel_bindings (id,corp_id,application_id,external_subject_id,membership_id,tenant_id,store_id,status,version,created_at,updated_at) VALUES ($1,'fixture-corp','fixture-app',$2,$3,$4,$5,'active',1,NOW(),NOW())",
				[binding, subject, membership, tenant, store],
			);
	});
	afterAll(async () => {
		await pool.end();
		// Only this generated test schema, never public/shared tables.
		await administrator.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
		await administrator.end();
	});
	function nextMessage() {
		return { ...message, messageId: randomUUID() };
	}
	async function claim(input = nextMessage()) {
		const output = await repository.claim({
			message: input,
			payloadHash: weComPayloadHash(input),
			requestId: randomUUID(),
		});
		if (output.status !== "claimed") throw new Error("fixture must claim once");
		return { input, id: output.id };
	}
	async function conversation() {
		const conversationId = randomUUID();
		await pool.query(
			"INSERT INTO conversations (id,tenant_id,store_id,customer_id,created_at,updated_at) VALUES ($1,$2,$3,'fixture-customer',NOW(),NOW())",
			[conversationId, demo.tenants.a.id, demo.stores.a1.id],
		);
		return { conversationId, customerId: "fixture-customer" };
	}

	it("resolves current internal member authority and rejects disabled/missing/multiple memberships", async () => {
		const resolved = await repository.resolveIdentity(message, "request");
		expect(resolved?.context.actor.role).toBe("agent");
		expect(resolved?.context.actor.capabilities).not.toContain("handoff:create");
		expect(resolved?.context.scope).toEqual({ tenantId: demo.tenants.a.id, storeId: demo.stores.a1.id });
		expect(
			(await repository.resolveIdentity({ ...message, externalSubjectId: "bob-fixture" }, "request"))?.context.scope,
		).toEqual({ tenantId: demo.tenants.b.id, storeId: demo.stores.b1.id });
		expect(await repository.resolveIdentity({ ...message, applicationId: "different" }, "request")).toBeUndefined();
		expect(await repository.resolveIdentity({ ...message, externalSubjectId: "unknown" }, "request")).toBeUndefined();
		await pool.query("UPDATE channel_bindings SET status='disabled' WHERE id='binding-a'");
		expect(await repository.resolveIdentity(message, "request")).toBeUndefined();
		await pool.query("UPDATE channel_bindings SET status='active' WHERE id='binding-a'");
		await pool.query(
			"INSERT INTO memberships (id,user_id,tenant_id,store_id,role,created_at) VALUES ('extra-member',$1,$2,$3,'agent',NOW())",
			[demo.users.alice.id, demo.tenants.b.id, demo.stores.b1.id],
		);
		expect(await repository.resolveIdentity(message, "request")).toBeUndefined();
		await pool.query("DELETE FROM memberships WHERE id='extra-member'");
	});

	it("rejects cross-scope bindings and mixed nullable binding/scope or conversation references in SQL", async () => {
		await expect(
			pool.query(
				"INSERT INTO channel_bindings (id,corp_id,application_id,external_subject_id,membership_id,tenant_id,store_id,status,version,created_at,updated_at) VALUES ('foreign','c','a','s','demo-membership-bob-b1',$1,$2,'active',1,NOW(),NOW())",
				[demo.tenants.a.id, demo.stores.a1.id],
			),
		).rejects.toMatchObject({ code: "23503" });
		const row = await claim();
		await expect(
			pool.query("UPDATE wecom_inbound_messages SET tenant_id=$2 WHERE id=$1", [row.id, demo.tenants.a.id]),
		).rejects.toMatchObject({ code: "23514" });
		const ownedConversation = await conversation();
		const bob = await repository.resolveIdentity({ ...message, externalSubjectId: "bob-fixture" }, "request");
		expect(await repository.attachConversation(row.id, bob!, ownedConversation)).toBe(false);
		await expect(
			pool.query(
				"UPDATE wecom_inbound_messages SET binding_id='binding-b',tenant_id=$2,store_id=$3,conversation_id=$4 WHERE id=$1",
				[row.id, demo.tenants.b.id, demo.stores.b1.id, ownedConversation.conversationId],
			),
		).rejects.toMatchObject({ code: "23503" });
	});

	it("persists one concurrent message claim and never replays after repository reconstruction or state failures", async () => {
		for (const state of ["processing", "failed", "indeterminate", "completed"] as const) {
			const input = nextMessage();
			const args = { message: input, payloadHash: weComPayloadHash(input), requestId: randomUUID() };
			const outcomes = await Promise.all([repository.claim(args), new PostgresWeComRepository(pool).claim(args)]);
			expect(outcomes.filter((row) => row.status === "claimed")).toHaveLength(1);
			await pool.query("UPDATE wecom_inbound_messages SET state=$2 WHERE message_id=$1", [input.messageId, state]);
			expect(await new PostgresWeComRepository(pool).claim(args)).toEqual({ status: "duplicate" });
			expect(
				await repository.claim({ ...args, payloadHash: weComPayloadHash({ ...input, text: "changed" }) }),
			).toEqual({ status: "conflict" });
			expect(
				(
					await pool.query("SELECT COUNT(*)::integer AS count FROM wecom_inbound_messages WHERE message_id=$1", [
						input.messageId,
					])
				).rows[0].count,
			).toBe(1);
		}
	});

	it("serializes scoped conversations across repository instances and preserves crash/uncertain reservations", async () => {
		const owner = (await repository.resolveIdentity(message, "request"))!;
		const target = await conversation();
		const first = await claim();
		const second = await claim();
		const outcomes = await Promise.all([
			repository.attachConversation(first.id, owner, target),
			new PostgresWeComRepository(pool).attachConversation(second.id, owner, target),
		]);
		expect(outcomes.filter(Boolean)).toHaveLength(1);
		const third = await claim();
		expect(await new PostgresWeComRepository(pool).attachConversation(third.id, owner, target)).toBe(false);
		const winner = outcomes[0] ? first.id : second.id;
		await repository.finish(winner, {
			state: "indeterminate",
			deliveryState: "not_sent",
			errorCategory: "dispatch_unavailable",
		});
		expect(await repository.attachConversation(third.id, owner, target)).toBe(false);
	});

	it("composes durable claim/authority/dispatch/outbound once without saving message or answer bodies", async () => {
		const target = await conversation();
		const respond = vi.fn<WeComCoreOptions["respond"]>(async () => ({
			type: "fallback",
			text: "private final body",
			evidence: [],
			toolsCalled: ["search_knowledge"],
			piSessionId: "session-fixture",
			sessionEvents: [],
		}));
		const send = vi.fn<WeComCoreOptions["outbound"]["send"]>(async () => undefined);
		const options: WeComCoreOptions = {
			repository,
			receiver: message,
			resolveConversation: async () => target,
			respond,
			outbound: { send },
		};
		const input = nextMessage();
		expect(await new WeComCore(options).handle(input)).toEqual({ status: "completed", resultType: "fallback" });
		expect(await new WeComCore({ ...options, repository: new PostgresWeComRepository(pool) }).handle(input)).toEqual({
			status: "duplicate",
			category: "duplicate_event",
		});
		expect(respond).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenCalledTimes(1);
		const row = (await pool.query("SELECT * FROM wecom_inbound_messages WHERE message_id=$1", [input.messageId]))
			.rows[0];
		expect(row).toMatchObject({
			state: "completed",
			result_type: "fallback",
			delivery_state: "sent",
			binding_id: "binding-a",
			tenant_id: demo.tenants.a.id,
			store_id: demo.stores.a1.id,
		});
		expect(JSON.stringify(row)).not.toContain(input.text);
		expect(JSON.stringify(row)).not.toContain("private final body");
	});
});
