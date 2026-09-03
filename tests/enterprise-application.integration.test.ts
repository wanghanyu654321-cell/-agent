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
		).toBe("4");
		expect(
			(await application.pool.query<{ count: string }>("SELECT count(*)::text AS count FROM memberships")).rows[0]
				?.count,
		).toBe("4");
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
		).toBe("4");
		expect(
			(await second.pool.query<{ count: string }>("SELECT count(*)::text AS count FROM memberships")).rows[0]?.count,
		).toBe("4");
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

	it("runs governed-answer and ambiguous-evidence journeys through the default Enterprise composition", async () => {
		await resetDatabase();
		const origin = await start(await boot());
		const alice = await login(origin, "alice.agent@demo.example", "AliceDemo!2026");

		const governedAnswer = await support(origin, alice, "journey-governed", "customer-a", "请问门店营业时间？");
		expect(governedAnswer).toMatchObject({
			type: "answer",
			toolsCalled: ["search_faq"],
			evidence: [
				{
					id: "demo-faq-business-hours",
					kind: "faq",
					version: "demo-v1",
					sourceRef: "demo://portfolio/faq/business-hours",
				},
			],
		});
		expect(governedAnswer.text).toContain("DEMO / SYNTHETIC PORTFOLIO DATA");

		const ambiguous = await support(
			origin,
			alice,
			"journey-ambiguous",
			"customer-a",
			"这个退款到底应该按哪个规则处理？",
		);
		expect(ambiguous).toMatchObject({ type: "fallback", toolsCalled: ["search_knowledge"], evidence: [] });
		expect(ambiguous.text).not.toContain("规则 A");
		expect(ambiguous.text).not.toContain("规则 B");
	});

	it("projects durable Runtime audit events to Ava's safe scoped Audit DTO across restart", async () => {
		await resetDatabase();
		const first = await boot();
		const origin = await start(first);
		const alice = await login(origin, "alice.agent@demo.example", "AliceDemo!2026");
		const bob = await login(origin, "bob.agent@demo.example", "BobDemo!2026");
		const susan = await login(origin, "susan.supervisor@demo.example", "SusanDemo!2026");
		const ava = await login(origin, "ava.admin@demo.example", "AvaDemo!2026");

		await expect(me(origin, "ava.admin@demo.example", "AvaDemo!2026")).resolves.toMatchObject({
			actor: { userId: "demo-user-ava-admin", role: "admin", capabilities: expect.arrayContaining(["audit:read"]) },
			scope: { tenantId: "demo-tenant-a", storeId: "demo-store-a1" },
		});
		expect((await fetch(`${origin}/api/v1/audit-events`)).status).toBe(401);
		expect((await fetch(`${origin}/api/v1/audit-events`, { headers: { cookie: alice } })).status).toBe(403);
		expect((await fetch(`${origin}/api/v1/audit-events`, { headers: { cookie: susan } })).status).toBe(403);

		await support(origin, alice, "audit-a", "customer-a", "帮我记录一个退款售后工单");
		await support(origin, bob, "audit-b", "customer-b", "帮我记录一个退款售后工单");
		const events = (await readJson(origin, "/api/v1/audit-events", ava)) as Array<Record<string, unknown>>;
		expect(events).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					conversationId: "audit-a",
					eventType: "support-agent.audit",
					outcome: "answer",
					toolsCalled: ["create_ticket"],
				}),
			]),
		);
		expect(events).not.toEqual(expect.arrayContaining([expect.objectContaining({ conversationId: "audit-b" })]));
		expect(Object.keys(events.find((event) => event.conversationId === "audit-a") ?? {}).sort()).toEqual([
			"conversationId",
			"createdAt",
			"eventType",
			"id",
			"outcome",
			"storeId",
			"tenantId",
			"toolsCalled",
		]);
		expect(JSON.stringify(events)).not.toContain("payload");
		expect(JSON.stringify(events)).not.toContain("knowledgeRouting");

		await first.close();
		applications.splice(applications.indexOf(first), 1);
		const restarted = await boot();
		const restartedOrigin = await start(restarted);
		const restartedAva = await login(restartedOrigin, "ava.admin@demo.example", "AvaDemo!2026");
		expect(await readJson(restartedOrigin, "/api/v1/audit-events", restartedAva)).toEqual(
			expect.arrayContaining([expect.objectContaining({ conversationId: "audit-a" })]),
		);
	});

	it("proves default portfolio tool effects through scoped PostgreSQL read-back and restart", async () => {
		await resetDatabase();
		const first = await boot();
		const origin = await start(first);
		const alice = await login(origin, "alice.agent@demo.example", "AliceDemo!2026");
		const susan = await login(origin, "susan.supervisor@demo.example", "SusanDemo!2026");
		const bob = await login(origin, "bob.agent@demo.example", "BobDemo!2026");

		expect((await support(origin, alice, "ticket-proof", "customer-a", "帮我记录一个退款售后工单")).type).toBe(
			"answer",
		);
		await support(origin, alice, "ticket-proof", "customer-a", "帮我记录一个退款售后工单");
		expect(await readJson(origin, "/api/v1/tickets", alice)).toEqual(
			expect.arrayContaining([expect.objectContaining({ conversationId: "ticket-proof" })]),
		);
		expect(
			(
				await first.pool.query<{ count: string }>(
					"SELECT count(*)::text AS count FROM tickets WHERE conversation_id = $1",
					["ticket-proof"],
				)
			).rows[0]?.count,
		).toBe("1");

		expect((await support(origin, alice, "ordinary-denied", "customer-a", "这个投诉我需要转人工处理")).type).toBe(
			"fallback",
		);
		expect(await readJson(origin, "/api/v1/handoffs", alice)).not.toEqual(
			expect.arrayContaining([expect.objectContaining({ conversationId: "ordinary-denied" })]),
		);
		expect(
			(await support(origin, alice, "safety-proof", "customer-a", "顾客操作中皮肤越来越痒，应该怎么继续？")).type,
		).toBe("escalation");
		expect(await readJson(origin, "/api/v1/handoffs", alice)).toEqual(
			expect.arrayContaining([expect.objectContaining({ conversationId: "safety-proof" })]),
		);
		expect((await support(origin, susan, "ordinary-supervisor", "customer-s", "这个投诉我需要转人工处理")).type).toBe(
			"escalation",
		);
		expect(await readJson(origin, "/api/v1/handoffs", susan)).toEqual(
			expect.arrayContaining([expect.objectContaining({ conversationId: "ordinary-supervisor" })]),
		);
		expect(await readJson(origin, "/api/v1/tickets", bob)).toEqual([]);
		expect(await readJson(origin, "/api/v1/handoffs", bob)).toEqual([]);

		await first.close();
		applications.splice(applications.indexOf(first), 1);
		const restarted = await boot();
		const restartedOrigin = await start(restarted);
		const restartedAlice = await login(restartedOrigin, "alice.agent@demo.example", "AliceDemo!2026");
		expect(await readJson(restartedOrigin, "/api/v1/tickets", restartedAlice)).toEqual(
			expect.arrayContaining([expect.objectContaining({ conversationId: "ticket-proof" })]),
		);
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
): Promise<PublicSupportResult> {
	const response = await fetch(`${origin}/api/v1/support/respond`, {
		method: "POST",
		headers: { "content-type": "application/json", cookie },
		body: JSON.stringify({ conversationId, customerId, text }),
	});
	expect(response.status).toBe(200);
	return (await response.json()) as PublicSupportResult;
}

type PublicSupportResult = {
	type: "answer" | "fallback" | "escalation";
	text: string;
	toolsCalled: string[];
	evidence: Array<{ id: string; kind: string; version: string; sourceRef: string }>;
};

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
