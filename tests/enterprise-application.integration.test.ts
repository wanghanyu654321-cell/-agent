import type { AddressInfo } from "node:net";
import { fauxAssistantMessage, registerFauxProvider, streamSimple } from "@earendil-works/pi-ai/compat";
import { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";
import {
	createEnterpriseApplication,
	type EnterpriseApplication,
	type EnterpriseRuntimeFactory,
} from "../src/enterprise/application.ts";
import { applyEnterpriseBusinessMigrations, PostgresIdentityRepository } from "../src/enterprise/postgres.ts";
import { InMemoryRetrievalService, InMemorySupportStore, SupportAgentRuntime } from "../src/index.ts";

const postgresTestUrl = process.env.POSTGRES_TEST_URL;
const describePostgres = postgresTestUrl ? describe : describe.skip;
const applications: EnterpriseApplication[] = [];
const seedInconsistencyMessage = "Portfolio enterprise demo seed is partial or inconsistent.";

afterEach(async () => {
	while (applications.length > 0) await applications.pop()?.close();
});

describePostgres("enterprise application composition root", () => {
	it("boots an empty PostgreSQL database, applies migrations, seeds the demo, and exposes health", async () => {
		await resetDatabase();
		const application = await boot();
		const origin = await start(application);

		expect((await (await fetch(`${origin}/healthz`)).json()).status).toBe("ok");
		expect(
			(await application.pool.query<{ count: string }>("SELECT count(*)::text AS count FROM users")).rows[0]?.count,
		).toBe("3");
		expect(
			(await application.pool.query<{ count: string }>("SELECT count(*)::text AS count FROM memberships")).rows[0]
				?.count,
		).toBe("3");
		expect(
			(await application.pool.query<{ id: string }>("SELECT id FROM enterprise_schema_migrations ORDER BY id")).rows,
		).toEqual([{ id: "001_enterprise_identity" }, { id: "002_support_business_persistence" }]);
	});

	it("is repeat-safe across application startup and shutdown", async () => {
		await resetDatabase();
		const first = await boot();
		await start(first);
		await first.close();
		applications.splice(applications.indexOf(first), 1);

		const second = await boot();
		await start(second);
		expect(
			(await second.pool.query<{ count: string }>("SELECT count(*)::text AS count FROM users")).rows[0]?.count,
		).toBe("3");
		expect(
			(await second.pool.query<{ count: string }>("SELECT count(*)::text AS count FROM memberships")).rows[0]?.count,
		).toBe("3");
	});

	it("fails application bootstrap when the PostgreSQL demo graph is missing Bob's membership", async () => {
		await resetDatabase();
		const setupPool = new Pool({ connectionString: postgresTestUrl });
		try {
			await applyEnterpriseBusinessMigrations(setupPool);
			await createPostgresDemoGraphWithoutBobMembership(new PostgresIdentityRepository(setupPool));
		} finally {
			await setupPool.end();
		}

		await expect(createEnterpriseApplication({ databaseUrl: postgresTestUrl!, port: 0 })).rejects.toThrow(
			seedInconsistencyMessage,
		);
	});

	it("derives Alice, Susan, and Bob scope from composed HTTP authentication", async () => {
		await resetDatabase();
		const origin = await start(await boot());

		await expect(me(origin, "alice.agent@demo.example", "AliceDemo!2026")).resolves.toMatchObject({
			actor: { role: "agent" },
			scope: { tenantId: "demo-tenant-a", storeId: "demo-store-a1" },
		});
		await expect(me(origin, "susan.supervisor@demo.example", "SusanDemo!2026")).resolves.toMatchObject({
			actor: { role: "supervisor" },
			scope: { tenantId: "demo-tenant-a", storeId: "demo-store-a1" },
		});
		await expect(me(origin, "bob.agent@demo.example", "BobDemo!2026")).resolves.toMatchObject({
			actor: { role: "agent" },
			scope: { tenantId: "demo-tenant-b", storeId: "demo-store-b1" },
		});
	});

	it("keeps ordinary handoff authority server-derived through the composed application", async () => {
		await resetDatabase();
		const origin = await start(await boot(runtimeFactory()));
		const alice = await login(origin, "alice.agent@demo.example", "AliceDemo!2026");
		const aliceResponse = await support(origin, alice, "handoff-alice", "customer-alice", "请普通转人工");
		expect(aliceResponse.type).toBe("fallback");
		expect(await readJson(origin, "/api/v1/handoffs", alice)).toEqual([]);

		const susan = await login(origin, "susan.supervisor@demo.example", "SusanDemo!2026");
		const susanResponse = await support(origin, susan, "handoff-susan", "customer-susan", "请普通转人工");
		expect(susanResponse.type).toBe("escalation");
		expect(await readJson(origin, "/api/v1/handoffs", susan)).toEqual(
			expect.arrayContaining([expect.objectContaining({ conversationId: "handoff-susan" })]),
		);
	});

	it("keeps Alice and Bob HTTP business reads isolated without caller-supplied scope", async () => {
		await resetDatabase();
		const origin = await start(await boot(runtimeFactory()));
		const alice = await login(origin, "alice.agent@demo.example", "AliceDemo!2026");
		const bob = await login(origin, "bob.agent@demo.example", "BobDemo!2026");
		const susan = await login(origin, "susan.supervisor@demo.example", "SusanDemo!2026");

		await support(origin, alice, "ticket-alice", "customer-alice", "请创建工单");
		await support(origin, bob, "ticket-bob", "customer-bob", "请创建工单");
		await support(origin, susan, "handoff-susan", "customer-susan", "请普通转人工");

		const aliceTickets = await readJson(origin, "/api/v1/tickets", alice);
		const bobTickets = await readJson(origin, "/api/v1/tickets", bob);
		expect(aliceTickets).toEqual(
			expect.arrayContaining([expect.objectContaining({ conversationId: "ticket-alice" })]),
		);
		expect(aliceTickets).not.toEqual(
			expect.arrayContaining([expect.objectContaining({ conversationId: "ticket-bob" })]),
		);
		expect(bobTickets).toEqual(expect.arrayContaining([expect.objectContaining({ conversationId: "ticket-bob" })]));
		expect(bobTickets).not.toEqual(
			expect.arrayContaining([expect.objectContaining({ conversationId: "ticket-alice" })]),
		);
		expect(await readJson(origin, "/api/v1/handoffs", bob)).toEqual([]);
	});

	it("closes the HTTP server and PostgreSQL pool", async () => {
		await resetDatabase();
		const application = await boot();
		const origin = await start(application);
		await application.close();
		applications.splice(applications.indexOf(application), 1);

		await expect(fetch(`${origin}/healthz`)).rejects.toThrow();
		await expect(application.pool.query("SELECT 1")).rejects.toThrow();
	});
});

async function boot(runtimeFactory?: EnterpriseRuntimeFactory): Promise<EnterpriseApplication> {
	const application = await createEnterpriseApplication({
		databaseUrl: postgresTestUrl!,
		port: 0,
		runtimeFactory,
	});
	applications.push(application);
	return application;
}

async function start(application: EnterpriseApplication): Promise<string> {
	await application.start();
	const address = application.server.address() as AddressInfo;
	return `http://127.0.0.1:${address.port}`;
}

async function resetDatabase(): Promise<void> {
	const pool = new Pool({ connectionString: postgresTestUrl });
	try {
		await pool.query("DROP SCHEMA public CASCADE");
		await pool.query("CREATE SCHEMA public");
	} finally {
		await pool.end();
	}
}

async function createPostgresDemoGraphWithoutBobMembership(repository: PostgresIdentityRepository): Promise<void> {
	const createdAt = new Date("2026-09-01T00:00:00.000Z");
	await repository.createTenant({ id: "demo-tenant-a", name: "Demo Retail Group A", createdAt });
	await repository.createTenant({ id: "demo-tenant-b", name: "Demo Retail Group B", createdAt });
	await repository.createStore({ id: "demo-store-a1", tenantId: "demo-tenant-a", name: "Store A1", createdAt });
	await repository.createStore({ id: "demo-store-b1", tenantId: "demo-tenant-b", name: "Store B1", createdAt });
	await repository.createUser({
		id: "demo-user-alice-agent",
		email: "alice.agent@demo.example",
		displayName: "Alice Agent",
		passwordHash: "not-used-by-seed-validation",
		createdAt,
	});
	await repository.createUser({
		id: "demo-user-susan-supervisor",
		email: "susan.supervisor@demo.example",
		displayName: "Susan Supervisor",
		passwordHash: "not-used-by-seed-validation",
		createdAt,
	});
	await repository.createUser({
		id: "demo-user-bob-agent",
		email: "bob.agent@demo.example",
		displayName: "Bob Agent",
		passwordHash: "not-used-by-seed-validation",
		createdAt,
	});
	await repository.createMembership({
		id: "demo-membership-alice-a1",
		userId: "demo-user-alice-agent",
		tenantId: "demo-tenant-a",
		storeId: "demo-store-a1",
		role: "agent",
		createdAt,
	});
	await repository.createMembership({
		id: "demo-membership-susan-a1",
		userId: "demo-user-susan-supervisor",
		tenantId: "demo-tenant-a",
		storeId: "demo-store-a1",
		role: "supervisor",
		createdAt,
	});
}

async function login(origin: string, email: string, password: string): Promise<string> {
	const response = await fetch(`${origin}/api/v1/auth/login`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ email, password }),
	});
	expect(response.status).toBe(200);
	return response.headers.get("set-cookie")!;
}

async function me(origin: string, email: string, password: string): Promise<unknown> {
	return readJson(origin, "/api/v1/auth/me", await login(origin, email, password));
}

async function support(
	origin: string,
	cookie: string,
	conversationId: string,
	customerId: string,
	text: string,
): Promise<{ type: string }> {
	const response = await fetch(`${origin}/api/v1/support/respond`, {
		method: "POST",
		headers: { "content-type": "application/json", cookie },
		body: JSON.stringify({ conversationId, customerId, text }),
	});
	expect(response.status).toBe(200);
	return (await response.json()) as { type: string };
}

async function readJson(origin: string, path: string, cookie: string): Promise<unknown> {
	const response = await fetch(`${origin}${path}`, { headers: { cookie } });
	expect(response.status).toBe(200);
	return response.json();
}

function runtimeFactory(): EnterpriseRuntimeFactory {
	return (businessStore) => {
		const faux = registerFauxProvider();
		const runtime = new SupportAgentRuntime({
			model: faux.getModel(),
			streamFn: streamSimple,
			retrieval: new InMemoryRetrievalService(),
			store: new InMemorySupportStore(),
			businessStore,
			faq: [],
		});
		return {
			runtime: {
				async run(request) {
					if (request.text.includes("转人工")) {
						faux.setResponses([
							fauxAssistantMessage(
								[
									{
										type: "toolCall",
										id: `handoff-${request.conversationId}`,
										name: "handoff_to_human",
										arguments: { reason: "ordinary" },
									},
								],
								{ stopReason: "toolUse" },
							),
						]);
					} else {
						faux.setResponses([
							fauxAssistantMessage(
								[
									{
										type: "toolCall",
										id: `ticket-${request.conversationId}`,
										name: "create_ticket",
										arguments: {
											summary: "application ticket",
											idempotencyKey: `ticket-${request.conversationId}`,
										},
									},
								],
								{ stopReason: "toolUse" },
							),
							fauxAssistantMessage("已记录工单。"),
						]);
					}
					return runtime.run(request);
				},
			},
			close: () => faux.unregister(),
		};
	};
}
