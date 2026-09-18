import { fauxAssistantMessage, registerFauxProvider, streamSimple } from "@earendil-works/pi-ai/compat";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { EnterpriseSupportService } from "../src/enterprise/business.ts";
import { seedPortfolioEnterpriseDemoData } from "../src/enterprise/demo-data.ts";
import { createSupportExecutionContext } from "../src/enterprise/identity.ts";
import {
	applyEnterpriseBusinessMigrations,
	PostgresEnterpriseBusinessRepository,
	PostgresIdentityRepository,
} from "../src/enterprise/postgres.ts";
import { InMemoryRetrievalService, InMemorySupportStore, SupportAgentRuntime } from "../src/index.ts";

const postgresTestUrl = process.env.POSTGRES_TEST_URL;
const describePostgres = postgresTestUrl ? describe : describe.skip;
const registrations: Array<{ unregister(): void }> = [];

afterEach(() => {
	while (registrations.length > 0) registrations.pop()?.unregister();
});

describePostgres("PostgreSQL enterprise support business integration", () => {
	const pool = new Pool({ connectionString: postgresTestUrl });
	const identity = new PostgresIdentityRepository(pool);
	const business = new PostgresEnterpriseBusinessRepository(pool);
	let demo: Awaited<ReturnType<typeof seedPortfolioEnterpriseDemoData>>;

	beforeAll(async () => {
		await applyEnterpriseBusinessMigrations(pool);
		await pool.query(
			"TRUNCATE audit_events, handoffs, tickets, conversations, auth_sessions, memberships, stores, users, tenants",
		);
		demo = await seedPortfolioEnterpriseDemoData(identity, new Date("2026-09-01T00:00:00.000Z"));
	});

	afterAll(async () => {
		await pool.end();
	});

	it("persists a runtime ticket and audit across application reconstruction with PostgreSQL idempotency", async () => {
		const alice = contextFor(demo, "alice");
		const first = createRuntime(business, [
			fauxAssistantMessage(
				[
					{
						type: "toolCall",
						id: "ticket-1",
						name: "create_ticket",
						arguments: { summary: "退款工单", idempotencyKey: "refund-1" },
					},
				],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("已记录您的工单。"),
		]);
		const firstService = new EnterpriseSupportService({ repository: business, runtime: first });

		const result = await firstService.respond(alice, {
			conversationId: "conversation-a",
			customerId: "customer-a",
			text: "请帮我创建退款工单",
		});

		expect(result.type).toBe("answer");
		expect(await business.listTickets(demo.tenants.a.id, demo.stores.a1.id)).toHaveLength(1);
		expect(await business.listAuditEvents(demo.tenants.a.id, demo.stores.a1.id)).toHaveLength(1);

		const secondService = new EnterpriseSupportService({
			repository: new PostgresEnterpriseBusinessRepository(pool),
			runtime: createRuntime(business, [fauxAssistantMessage("unused")]),
		});
		expect(await secondService.listTickets(alice)).toHaveLength(1);
		const concurrent = await Promise.all(
			Array.from({ length: 2 }, () =>
				business.createTicket({
					tenantId: demo.tenants.a.id,
					storeId: demo.stores.a1.id,
					conversationId: "conversation-a",
					summary: "重复退款工单",
					idempotencyKey: "refund-concurrent",
				}),
			),
		);
		expect(concurrent.filter((entry) => !entry.duplicate)).toHaveLength(1);
		expect(await business.findTicket(demo.tenants.a.id, "refund-concurrent")).toBeDefined();
		const persistedTicketCount = await pool.query<{ count: string }>(
			"SELECT count(*)::text AS count FROM tickets WHERE tenant_id = $1 AND idempotency_key = $2",
			[demo.tenants.a.id, "refund-concurrent"],
		);
		expect(persistedTicketCount.rows[0]?.count).toBe("1");
	});

	it("enforces tenant/store conversation ownership in reads and database foreign keys", async () => {
		const alice = contextFor(demo, "alice");
		const bob = contextFor(demo, "bob");
		await business.createConversation({
			id: "conversation-b",
			tenantId: demo.tenants.b.id,
			storeId: demo.stores.b1.id,
			customerId: "customer-b",
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		const service = new EnterpriseSupportService({
			repository: business,
			runtime: createRuntime(business, [fauxAssistantMessage("unused")]),
		});
		expect(await service.listConversations(alice)).not.toEqual(
			expect.arrayContaining([expect.objectContaining({ id: "conversation-b" })]),
		);
		expect(await service.listConversations(bob)).toEqual(
			expect.arrayContaining([expect.objectContaining({ id: "conversation-b" })]),
		);

		await expect(
			pool.query(
				"INSERT INTO tickets (tenant_id, store_id, conversation_id, summary, idempotency_key, created_at) VALUES ($1, $2, $3, $4, $5, NOW())",
				[demo.tenants.a.id, demo.stores.a1.id, "conversation-b", "cross tenant", "cross-ticket"],
			),
		).rejects.toThrow();
		await expect(
			pool.query(
				"INSERT INTO handoffs (tenant_id, store_id, conversation_id, reason, created_at) VALUES ($1, $2, $3, $4, NOW())",
				[demo.tenants.a.id, demo.stores.a1.id, "conversation-b", "cross tenant"],
			),
		).rejects.toThrow();
		await expect(
			pool.query(
				"INSERT INTO audit_events (tenant_id, store_id, conversation_id, event_type, payload, created_at) VALUES ($1, $2, $3, $4, $5::jsonb, NOW())",
				[
					demo.tenants.a.id,
					demo.stores.a1.id,
					"conversation-b",
					"support-agent.audit",
					JSON.stringify({ safe: true }),
				],
			),
		).rejects.toThrow();
	});

	it("keeps ordinary handoff capability-gated while persisting a safety handoff for an agent", async () => {
		const alice = contextFor(demo, "alice");
		const safetyRuntime = createRuntime(business, [fauxAssistantMessage("请继续操作。")]);
		const service = new EnterpriseSupportService({ repository: business, runtime: safetyRuntime });

		const result = await service.respond(alice, {
			conversationId: "conversation-safety",
			customerId: "customer-safety",
			text: "顾客操作中皮肤越来越痒，应该怎么继续？",
		});

		expect(result.type).toBe("escalation");
		expect(await business.findHandoff(demo.tenants.a.id, demo.stores.a1.id, "conversation-safety")).toMatchObject({
			conversationId: "conversation-safety",
		});
	});

	it("enforces durable handoff idempotency and ordinary role authorization", async () => {
		const alice = contextFor(demo, "alice");
		const susan = contextFor(demo, "susan");
		await business.createConversation({
			id: "conversation-handoff",
			tenantId: demo.tenants.a.id,
			storeId: demo.stores.a1.id,
			customerId: "customer-handoff",
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		const duplicateAttempts = await Promise.all(
			Array.from({ length: 2 }, () =>
				business.createHandoff({
					tenantId: demo.tenants.a.id,
					storeId: demo.stores.a1.id,
					conversationId: "conversation-handoff",
					reason: "duplicate check",
				}),
			),
		);
		expect(duplicateAttempts.filter((entry) => !entry.duplicate)).toHaveLength(1);
		const persistedHandoffCount = await pool.query<{ count: string }>(
			"SELECT count(*)::text AS count FROM handoffs WHERE tenant_id = $1 AND store_id = $2 AND conversation_id = $3",
			[demo.tenants.a.id, demo.stores.a1.id, "conversation-handoff"],
		);
		expect(persistedHandoffCount.rows[0]?.count).toBe("1");

		const agentRuntime = createRuntime(business, [
			fauxAssistantMessage(
				[{ type: "toolCall", id: "agent-handoff", name: "handoff_to_human", arguments: { reason: "need help" } }],
				{ stopReason: "toolUse" },
			),
		]);
		const agentService = new EnterpriseSupportService({ repository: business, runtime: agentRuntime });
		const agentResult = await agentService.respond(alice, {
			conversationId: "conversation-agent-ordinary",
			customerId: "customer-agent-ordinary",
			text: "请转人工",
		});
		expect(agentResult.type).toBe("fallback");
		expect(
			await business.findHandoff(demo.tenants.a.id, demo.stores.a1.id, "conversation-agent-ordinary"),
		).toBeUndefined();

		const supervisorRuntime = createRuntime(business, [
			fauxAssistantMessage(
				[
					{
						type: "toolCall",
						id: "supervisor-handoff",
						name: "handoff_to_human",
						arguments: { reason: "need help" },
					},
				],
				{ stopReason: "toolUse" },
			),
		]);
		const supervisorService = new EnterpriseSupportService({ repository: business, runtime: supervisorRuntime });
		const supervisorResult = await supervisorService.respond(susan, {
			conversationId: "conversation-supervisor-ordinary",
			customerId: "customer-supervisor-ordinary",
			text: "请转人工",
		});
		expect(supervisorResult.type).toBe("escalation");
		expect(
			await business.findHandoff(demo.tenants.a.id, demo.stores.a1.id, "conversation-supervisor-ordinary"),
		).toMatchObject({
			conversationId: "conversation-supervisor-ordinary",
		});
	});

	it("keeps tickets, handoffs, and audits bidirectionally isolated by tenant/store", async () => {
		const alice = contextFor(demo, "alice");
		const bob = contextFor(demo, "bob");
		await business.createConversation({
			id: "conversation-isolation-a",
			tenantId: demo.tenants.a.id,
			storeId: demo.stores.a1.id,
			customerId: "customer-isolation-a",
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		await business.createConversation({
			id: "conversation-isolation-b",
			tenantId: demo.tenants.b.id,
			storeId: demo.stores.b1.id,
			customerId: "customer-isolation-b",
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		await business.createTicket({
			tenantId: demo.tenants.a.id,
			storeId: demo.stores.a1.id,
			conversationId: "conversation-isolation-a",
			summary: "Alice ticket",
			idempotencyKey: "alice-isolation-ticket",
		});
		await business.createHandoff({
			tenantId: demo.tenants.a.id,
			storeId: demo.stores.a1.id,
			conversationId: "conversation-isolation-a",
			reason: "Alice handoff",
		});
		await business.recordAudit({
			tenantId: demo.tenants.a.id,
			storeId: demo.stores.a1.id,
			conversationId: "conversation-isolation-a",
			eventType: "support-agent.audit",
			payload: { actor: "alice" },
		});
		await business.createTicket({
			tenantId: demo.tenants.b.id,
			storeId: demo.stores.b1.id,
			conversationId: "conversation-isolation-b",
			summary: "Bob ticket",
			idempotencyKey: "bob-isolation-ticket",
		});
		await business.createHandoff({
			tenantId: demo.tenants.b.id,
			storeId: demo.stores.b1.id,
			conversationId: "conversation-isolation-b",
			reason: "Bob handoff",
		});
		await business.recordAudit({
			tenantId: demo.tenants.b.id,
			storeId: demo.stores.b1.id,
			conversationId: "conversation-isolation-b",
			eventType: "support-agent.audit",
			payload: { actor: "bob" },
		});
		const service = new EnterpriseSupportService({ repository: business, runtime: createRuntime(business, []) });

		await expect(service.listTickets(alice)).resolves.not.toEqual(
			expect.arrayContaining([expect.objectContaining({ idempotencyKey: "bob-isolation-ticket" })]),
		);
		await expect(service.listTickets(alice)).resolves.toEqual(
			expect.arrayContaining([expect.objectContaining({ idempotencyKey: "alice-isolation-ticket" })]),
		);
		await expect(service.listHandoffs(alice)).resolves.not.toEqual(
			expect.arrayContaining([expect.objectContaining({ conversationId: "conversation-isolation-b" })]),
		);
		await expect(service.listHandoffs(alice)).resolves.toEqual(
			expect.arrayContaining([expect.objectContaining({ conversationId: "conversation-isolation-a" })]),
		);
		await expect(service.listAuditEvents(createAdminContext(demo, "alice"))).resolves.not.toEqual(
			expect.arrayContaining([expect.objectContaining({ conversationId: "conversation-isolation-b" })]),
		);
		await expect(service.listAuditEvents(createAdminContext(demo, "alice"))).resolves.toEqual(
			expect.arrayContaining([expect.objectContaining({ conversationId: "conversation-isolation-a" })]),
		);
		await expect(service.listTickets(bob)).resolves.toEqual(
			expect.arrayContaining([expect.objectContaining({ idempotencyKey: "bob-isolation-ticket" })]),
		);
		await expect(service.listTickets(bob)).resolves.not.toEqual(
			expect.arrayContaining([expect.objectContaining({ idempotencyKey: "alice-isolation-ticket" })]),
		);
		await expect(service.listHandoffs(bob)).resolves.toEqual(
			expect.arrayContaining([expect.objectContaining({ conversationId: "conversation-isolation-b" })]),
		);
		await expect(service.listHandoffs(bob)).resolves.not.toEqual(
			expect.arrayContaining([expect.objectContaining({ conversationId: "conversation-isolation-a" })]),
		);
		await expect(service.listAuditEvents(createAdminContext(demo, "bob"))).resolves.toEqual(
			expect.arrayContaining([expect.objectContaining({ conversationId: "conversation-isolation-b" })]),
		);
		await expect(service.listAuditEvents(createAdminContext(demo, "bob"))).resolves.not.toEqual(
			expect.arrayContaining([expect.objectContaining({ conversationId: "conversation-isolation-a" })]),
		);
	});
});

function contextFor(
	demo: Awaited<ReturnType<typeof seedPortfolioEnterpriseDemoData>>,
	user: "alice" | "bob" | "susan",
) {
	const membership = {
		id:
			user === "alice"
				? "demo-membership-alice-a1"
				: user === "susan"
					? "demo-membership-susan-a1"
					: "demo-membership-bob-b1",
		userId: demo.users[user].id,
		tenantId: user === "bob" ? demo.tenants.b.id : demo.tenants.a.id,
		storeId: user === "bob" ? demo.stores.b1.id : demo.stores.a1.id,
		role: user === "susan" ? ("supervisor" as const) : ("agent" as const),
		createdAt: new Date(),
	};
	return createSupportExecutionContext(membership, `request-${user}`);
}

function createAdminContext(demo: Awaited<ReturnType<typeof seedPortfolioEnterpriseDemoData>>, user: "alice" | "bob") {
	const base = contextFor(demo, user);
	return {
		...base,
		actor: {
			...base.actor,
			role: "admin" as const,
			capabilities: [...base.actor.capabilities, "audit:read" as const],
		},
	};
}

function createRuntime(
	business: PostgresEnterpriseBusinessRepository,
	responses: Parameters<ReturnType<typeof registerFauxProvider>["setResponses"]>[0],
) {
	const faux = registerFauxProvider();
	registrations.push(faux);
	faux.setResponses(responses);
	return new SupportAgentRuntime({
		model: faux.getModel(),
		streamFn: streamSimple,
		retrieval: new InMemoryRetrievalService(),
		store: new InMemorySupportStore(),
		businessStore: business,
		faq: [],
	});
}
