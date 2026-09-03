import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { EnterpriseAuthService } from "../src/enterprise/auth.ts";
import type { EnterpriseSupportPort } from "../src/enterprise/business.ts";
import { seedPortfolioEnterpriseDemoData } from "../src/enterprise/demo-data.ts";
import { createEnterpriseHttpServer } from "../src/enterprise/http-api.ts";
import { InMemoryIdentityRepository } from "../src/enterprise/identity.ts";
import type { SupportResult } from "../src/index.ts";

const servers: ReturnType<typeof createEnterpriseHttpServer>[] = [];

afterEach(async () => {
	while (servers.length > 0) {
		const server = servers.pop();
		if (!server?.listening) continue;
		await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
	}
});

describe("enterprise business read API", () => {
	it("derives ticket scope from the authenticated session and rejects query-scope spoofing", async () => {
		const repository = new InMemoryIdentityRepository();
		const demo = await seedPortfolioEnterpriseDemoData(repository);
		const auth = new EnterpriseAuthService(repository);
		const service = new CapturingEnterpriseSupportPort();
		const server = createEnterpriseHttpServer({ auth, supportService: service });
		servers.push(server);
		server.listen(0, "127.0.0.1");
		await once(server, "listening");
		const address = server.address() as AddressInfo;
		const origin = `http://127.0.0.1:${address.port}`;
		const login = await fetch(`${origin}/api/v1/auth/login`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(demo.credentials.alice),
		});
		const cookie = login.headers.get("set-cookie")!;

		const tickets = await fetch(`${origin}/api/v1/tickets`, { headers: { cookie } });
		expect(tickets.status).toBe(200);
		expect(await tickets.json()).toEqual([expect.objectContaining({ id: "ticket-a" })]);
		expect(service.ticketScopes).toEqual([{ tenantId: demo.tenants.a.id, storeId: demo.stores.a1.id }]);

		const spoofed = await fetch(`${origin}/api/v1/tickets?tenantId=${demo.tenants.b.id}`, { headers: { cookie } });
		expect(spoofed.status).toBe(400);
		expect(service.ticketScopes).toHaveLength(1);

		const audit = await fetch(`${origin}/api/v1/audit-events`, { headers: { cookie } });
		expect(audit.status).toBe(403);
	});

	it("projects Ava's audit read to safe public fields while preserving scope and capability checks", async () => {
		const repository = new InMemoryIdentityRepository();
		await seedPortfolioEnterpriseDemoData(repository);
		const auth = new EnterpriseAuthService(repository);
		const service = new CapturingEnterpriseSupportPort();
		const server = createEnterpriseHttpServer({ auth, supportService: service });
		servers.push(server);
		server.listen(0, "127.0.0.1");
		await once(server, "listening");
		const address = server.address() as AddressInfo;
		const origin = `http://127.0.0.1:${address.port}`;

		const avaLogin = await fetch(`${origin}/api/v1/auth/login`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ email: "ava.admin@demo.example", password: "AvaDemo!2026" }),
		});
		expect(avaLogin.status).toBe(200);
		const avaCookie = avaLogin.headers.get("set-cookie")!;

		const audit = await fetch(`${origin}/api/v1/audit-events`, { headers: { cookie: avaCookie } });
		expect(audit.status).toBe(200);
		expect(await audit.json()).toEqual([
			{
				id: "audit-a",
				tenantId: "demo-tenant-a",
				storeId: "demo-store-a1",
				conversationId: "conversation-a",
				eventType: "support-agent.audit",
				outcome: "answer",
				toolsCalled: ["search_faq"],
				createdAt: "2026-09-01T00:00:00.000Z",
			},
		]);
		expect(service.auditScopes).toEqual([{ tenantId: "demo-tenant-a", storeId: "demo-store-a1" }]);

		const responseText = await (
			await fetch(`${origin}/api/v1/audit-events`, { headers: { cookie: avaCookie } })
		).text();
		expect(responseText).not.toContain("internal-provider-payload");
		expect(responseText).not.toContain("payload");

		const alice = await fetch(`${origin}/api/v1/auth/login`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ email: "alice.agent@demo.example", password: "AliceDemo!2026" }),
		});
		expect(
			(await fetch(`${origin}/api/v1/audit-events`, { headers: { cookie: alice.headers.get("set-cookie")! } }))
				.status,
		).toBe(403);

		const susan = await fetch(`${origin}/api/v1/auth/login`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ email: "susan.supervisor@demo.example", password: "SusanDemo!2026" }),
		});
		expect(
			(await fetch(`${origin}/api/v1/audit-events`, { headers: { cookie: susan.headers.get("set-cookie")! } }))
				.status,
		).toBe(403);

		const spoofed = await fetch(`${origin}/api/v1/audit-events?tenantId=demo-tenant-b`, {
			headers: { cookie: avaCookie },
		});
		expect(spoofed.status).toBe(400);
	});
});

class CapturingEnterpriseSupportPort implements EnterpriseSupportPort {
	readonly ticketScopes: Array<{ tenantId: string; storeId: string }> = [];
	readonly auditScopes: Array<{ tenantId: string; storeId: string }> = [];

	async respond(): Promise<SupportResult> {
		return {
			type: "answer",
			text: "unused",
			piSessionId: "unused",
			toolsCalled: [],
			sessionEvents: [],
			evidence: [],
		};
	}

	async listConversations() {
		return [];
	}

	async listTickets(context: { scope: { tenantId: string; storeId: string } }) {
		this.ticketScopes.push({ ...context.scope });
		return [
			{
				id: "ticket-a",
				tenantId: context.scope.tenantId,
				storeId: context.scope.storeId,
				conversationId: "conversation-a",
				summary: "test",
				idempotencyKey: "test-key",
				createdAt: new Date("2026-09-01T00:00:00.000Z"),
			},
		];
	}

	async listHandoffs() {
		return [];
	}

	async listAuditEvents(context: { scope: { tenantId: string; storeId: string } }) {
		this.auditScopes.push({ ...context.scope });
		return [
			{
				id: "audit-a",
				tenantId: context.scope.tenantId,
				storeId: context.scope.storeId,
				conversationId: "conversation-a",
				eventType: "support-agent.audit" as const,
				payload: {
					outcome: "answer",
					toolsCalled: ["search_faq", "unknown_tool"],
					providerPayload: "internal-provider-payload",
				},
				createdAt: new Date("2026-09-01T00:00:00.000Z"),
			},
		];
	}
}
