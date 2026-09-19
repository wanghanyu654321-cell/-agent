import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresWeComCustomerRepository, type VerifiedWeComCustomerText } from "../../src/channels/wecom/customer.ts";
import { seedPortfolioEnterpriseDemoData } from "../../src/enterprise/demo-data.ts";
import { PostgresIdentityRepository } from "../../src/enterprise/postgres.ts";

const databaseUrl = process.env.POSTGRES_TEST_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres("WeChat Customer Service customer identity and durable routing", () => {
	const schema = `wecom_customer_${randomUUID().replaceAll("-", "")}`;
	const administrator = new Pool({ connectionString: databaseUrl });
	const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
	const repository = new PostgresWeComCustomerRepository(pool);
	let demo: Awaited<ReturnType<typeof seedPortfolioEnterpriseDemoData>>;

	beforeAll(async () => {
		await administrator.query(`CREATE SCHEMA ${schema}`);
		for (const filename of [
			"001_enterprise_identity.sql",
			"002_support_business_persistence.sql",
			"003_job_ready_storeops.sql",
			"006_wecom_customer_identity.sql",
		]) {
			await pool.query(readFileSync(new URL(`../../migrations/${filename}`, import.meta.url), "utf8"));
		}
		demo = await seedPortfolioEnterpriseDemoData(new PostgresIdentityRepository(pool));
		await pool.query(
			"INSERT INTO wecom_kf_channels (id,corp_id,open_kfid,tenant_id,store_id,authority_membership_id,status,version,created_at,updated_at) VALUES ('channel-a','fixture-corp','wk-a',$1,$2,'demo-membership-alice-a1','active',1,NOW(),NOW()),('channel-b','fixture-corp','wk-b',$3,$4,'demo-membership-bob-b1','active',1,NOW(),NOW())",
			[demo.tenants.a.id, demo.stores.a1.id, demo.tenants.b.id, demo.stores.b1.id],
		);
	});

	afterAll(async () => {
		await pool.end();
		await administrator.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
		await administrator.end();
	});

	function message(overrides: Partial<VerifiedWeComCustomerText> = {}): VerifiedWeComCustomerText {
		return {
			corpId: "fixture-corp",
			openKfId: "wk-a",
			externalUserId: "wm-external-customer",
			messageId: randomUUID(),
			sentAtUnix: 1_726_700_000,
			text: "customer text is never stored raw",
			...overrides,
		};
	}

	it("separates authenticated channel authority from external customer identity", async () => {
		const first = await repository.resolveRoute(message(), "request-a");
		expect(first?.context.scope).toEqual({ tenantId: demo.tenants.a.id, storeId: demo.stores.a1.id });
		expect(first?.context.actor.userId).toBe(demo.users.alice.id);
		expect(first?.context.actor.capabilities).toContain("agent:invoke");
		expect(first?.customerId).not.toBe(first?.context.actor.userId);

		const again = await repository.resolveRoute(message(), "request-b");
		expect(again?.customerId).toBe(first?.customerId);
		expect(again?.conversationId).toBe(first?.conversationId);

		const otherChannel = await repository.resolveRoute(message({ openKfId: "wk-b" }), "request-c");
		expect(otherChannel?.context.scope).toEqual({ tenantId: demo.tenants.b.id, storeId: demo.stores.b1.id });
		expect(otherChannel?.customerId).not.toBe(first?.customerId);
	});

	it("fails closed for unknown or disabled open_kfid and rejects cross-scope authority in SQL", async () => {
		expect(await repository.resolveRoute(message({ openKfId: "wk-unknown" }), "request")).toBeUndefined();
		await pool.query("UPDATE wecom_kf_channels SET status='disabled' WHERE id='channel-a'");
		expect(await repository.resolveRoute(message(), "request")).toBeUndefined();
		await pool.query("UPDATE wecom_kf_channels SET status='active' WHERE id='channel-a'");
		await expect(
			pool.query(
				"INSERT INTO wecom_kf_channels (id,corp_id,open_kfid,tenant_id,store_id,authority_membership_id,status,version,created_at,updated_at) VALUES ('cross-scope','fixture-corp','wk-cross',$1,$2,'demo-membership-bob-b1','active',1,NOW(),NOW())",
				[demo.tenants.a.id, demo.stores.a1.id],
			),
		).rejects.toMatchObject({ code: "23503" });
	});

	it("deduplicates msgid durably, detects payload conflicts and persists no raw message body", async () => {
		const input = message();
		const requestId = randomUUID();
		const first = await repository.claim(input, requestId);
		expect(first.status).toBe("claimed");
		expect(await new PostgresWeComCustomerRepository(pool).claim(input, randomUUID())).toEqual({
			status: "duplicate",
		});
		expect(await repository.claim({ ...input, text: "changed body" }, randomUUID())).toEqual({ status: "conflict" });

		if (first.status !== "claimed") throw new Error("fixture must claim once");
		const route = await repository.resolveRoute(input, requestId);
		expect(route).toBeDefined();
		expect(await repository.attachRoute(first.id, route!)).toBe(true);
		const row = (
			await pool.query("SELECT * FROM wecom_customer_inbound_messages WHERE message_id=$1", [input.messageId])
		).rows[0];
		expect(row).toMatchObject({
			state: "routed",
			channel_binding_id: "channel-a",
			tenant_id: demo.tenants.a.id,
			store_id: demo.stores.a1.id,
		});
		expect(JSON.stringify(row)).not.toContain(input.text);
	});
	it("marks an unroutable claimed message failed without persisting its raw body", async () => {
		const input = message({ messageId: randomUUID(), text: "raw body must stay out of operational metadata" });
		const claim = await repository.claim(input, randomUUID());
		if (claim.status !== "claimed") throw new Error("fixture must claim once");
		expect(await repository.markFailed(claim.id, "unbound_channel")).toBe(true);
		const row = (
			await pool.query(
				"SELECT state,error_category,payload_hash FROM wecom_customer_inbound_messages WHERE message_id=$1",
				[input.messageId],
			)
		).rows[0];
		expect(row).toMatchObject({ state: "failed", error_category: "unbound_channel" });
		expect(JSON.stringify(row)).not.toContain(input.text);
	});

});
