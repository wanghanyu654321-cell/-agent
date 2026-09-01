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
});

function contextFor(demo: Awaited<ReturnType<typeof seedPortfolioEnterpriseDemoData>>, user: "alice" | "bob") {
	const membership = {
		id: user === "alice" ? "demo-membership-alice-a1" : "demo-membership-bob-b1",
		userId: demo.users[user].id,
		tenantId: user === "alice" ? demo.tenants.a.id : demo.tenants.b.id,
		storeId: user === "alice" ? demo.stores.a1.id : demo.stores.b1.id,
		role: "agent" as const,
		createdAt: new Date(),
	};
	return createSupportExecutionContext(membership, `request-${user}`);
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
