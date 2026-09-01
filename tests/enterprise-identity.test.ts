import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { EnterpriseAuthService } from "../src/enterprise/auth.ts";
import { seedPortfolioEnterpriseDemoData } from "../src/enterprise/demo-data.ts";
import { createEnterpriseHttpServer } from "../src/enterprise/http-api.ts";
import { InMemoryIdentityRepository, type SupportExecutionContext } from "../src/enterprise/identity.ts";
import type { SupportRuntimePort } from "../src/http-api.ts";
import type { SupportRequest, SupportResult } from "../src/index.ts";

const servers: ReturnType<typeof createEnterpriseHttpServer>[] = [];

afterEach(async () => {
	while (servers.length > 0) {
		const server = servers.pop();
		if (!server?.listening) continue;
		await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
	}
});

async function createIdentityFixture(now = new Date("2026-08-31T00:00:00.000Z")) {
	const repository = new InMemoryIdentityRepository();
	const demo = await seedPortfolioEnterpriseDemoData(repository, now);
	const auth = new EnterpriseAuthService(repository, { now: () => now, sessionTtlMs: 60_000 });
	return { repository, demo, auth, now };
}

describe("enterprise identity and tenancy foundation", () => {
	it("authenticates Alice with an opaque server-side hashed session", async () => {
		const { auth, repository, demo } = await createIdentityFixture();
		const login = await auth.login(demo.credentials.alice.email, demo.credentials.alice.password);

		expect(login).toBeDefined();
		expect(login?.token).not.toContain(demo.credentials.alice.password);
		const stored = await repository.findAuthSessionByUserId(demo.users.alice.id);
		expect(stored).toHaveLength(1);
		expect(stored[0]?.tokenHash).not.toBe(login?.token);
		expect(stored[0]?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
	});

	it("returns the same generic failure for an unknown email and an invalid password", async () => {
		const { auth, demo } = await createIdentityFixture();
		const wrongPassword = await auth.login(demo.credentials.alice.email, "not-the-password");
		const missingUser = await auth.login("nobody@demo.example", "not-the-password");

		expect(wrongPassword).toBeUndefined();
		expect(missingUser).toBeUndefined();
	});

	it("rejects expired sessions and invalidates sessions on logout", async () => {
		const { auth, demo, now } = await createIdentityFixture();
		const login = await auth.login(demo.credentials.alice.email, demo.credentials.alice.password);
		expect(login).toBeDefined();
		await auth.logout(login!.token);
		expect(await auth.resolveExecutionContext(login!.token, "request-after-logout")).toBeUndefined();

		const shortLived = new EnterpriseAuthService(auth.repository, {
			now: () => new Date(now.getTime() + 61_000),
			sessionTtlMs: 60_000,
		});
		const second = await auth.login(demo.credentials.alice.email, demo.credentials.alice.password);
		expect(second).toBeDefined();
		expect(await shortLived.resolveExecutionContext(second!.token, "request-expired")).toBeUndefined();
	});

	it("derives Alice, Susan, and Bob scopes and capabilities from membership", async () => {
		const { auth, demo } = await createIdentityFixture();
		const alice = await auth.login(demo.credentials.alice.email, demo.credentials.alice.password);
		const susan = await auth.login(demo.credentials.susan.email, demo.credentials.susan.password);
		const bob = await auth.login(demo.credentials.bob.email, demo.credentials.bob.password);

		const aliceContext = await auth.resolveExecutionContext(alice!.token, "alice-request");
		const susanContext = await auth.resolveExecutionContext(susan!.token, "susan-request");
		const bobContext = await auth.resolveExecutionContext(bob!.token, "bob-request");

		expect(aliceContext).toMatchObject({
			actor: {
				userId: demo.users.alice.id,
				role: "agent",
				capabilities: ["agent:invoke", "conversation:read", "ticket:create"],
			},
			scope: { tenantId: demo.tenants.a.id, storeId: demo.stores.a1.id },
		});
		expect(susanContext?.actor.capabilities).toContain("handoff:create");
		expect(susanContext?.actor.capabilities).not.toContain("audit:read");
		expect(bobContext?.scope).toEqual({ tenantId: demo.tenants.b.id, storeId: demo.stores.b1.id });
	});

	it("rejects cross-tenant membership lookup and inconsistent store membership creation", async () => {
		const { repository, demo } = await createIdentityFixture();
		expect(
			await repository.findMembership(demo.users.alice.id, demo.tenants.b.id, demo.stores.b1.id),
		).toBeUndefined();
		expect(await repository.findMembership(demo.users.bob.id, demo.tenants.a.id, demo.stores.a1.id)).toBeUndefined();
		await expect(
			repository.createMembership({
				id: "invalid-cross-tenant-membership",
				userId: demo.users.alice.id,
				tenantId: demo.tenants.a.id,
				storeId: demo.stores.b1.id,
				role: "agent",
				createdAt: new Date("2026-08-31T00:00:00.000Z"),
			}),
		).rejects.toThrow("does not belong to tenant");
	});

	it("ignores request-body tenant, store, role, and capability spoofing when invoking Runtime", async () => {
		const { auth, demo } = await createIdentityFixture();
		const captured: SupportRequest[] = [];
		const runtime: SupportRuntimePort = {
			async run(request): Promise<SupportResult> {
				captured.push(structuredClone(request));
				return {
					type: "answer",
					text: "safe",
					piSessionId: "pi-enterprise-1",
					toolsCalled: [],
					sessionEvents: [],
					evidence: [],
				};
			},
		};
		const server = createEnterpriseHttpServer({ auth, runtime });
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
		const cookie = login.headers.get("set-cookie");
		expect(login.status).toBe(200);
		expect(cookie).toContain("HttpOnly");
		expect(cookie).toContain("SameSite=Strict");

		const support = await fetch(`${origin}/api/v1/support/respond`, {
			method: "POST",
			headers: { "content-type": "application/json", cookie: cookie! },
			body: JSON.stringify({
				conversationId: "enterprise-spoof-1",
				customerId: "customer-1",
				text: "请问营业时间？",
				tenantId: demo.tenants.b.id,
				storeId: demo.stores.b1.id,
				role: "admin",
				permissions: ["audit:read", "handoff:create"],
			}),
		});

		expect(support.status).toBe(200);
		expect(captured).toEqual([
			{
				conversationId: "enterprise-spoof-1",
				customerId: "customer-1",
				text: "请问营业时间？",
				tenantId: demo.tenants.a.id,
				storeId: demo.stores.a1.id,
				permissions: ["tickets:write"],
				mayEscalate: false,
			},
		]);
	});

	it("returns authenticated execution context from /auth/me and removes it after logout", async () => {
		const { auth, demo } = await createIdentityFixture();
		const server = createEnterpriseHttpServer({ auth, runtime: unreachableRuntime() });
		servers.push(server);
		server.listen(0, "127.0.0.1");
		await once(server, "listening");
		const address = server.address() as AddressInfo;
		const origin = `http://127.0.0.1:${address.port}`;
		const login = await fetch(`${origin}/api/v1/auth/login`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(demo.credentials.susan),
		});
		const cookie = login.headers.get("set-cookie")!;
		const me = await fetch(`${origin}/api/v1/auth/me`, { headers: { cookie } });
		expect(me.status).toBe(200);
		expect((await me.json()) as SupportExecutionContext).toMatchObject({
			actor: { role: "supervisor" },
			scope: { tenantId: demo.tenants.a.id, storeId: demo.stores.a1.id },
		});

		const logout = await fetch(`${origin}/api/v1/auth/logout`, { method: "POST", headers: { cookie } });
		expect(logout.status).toBe(204);
		expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
		const afterLogout = await fetch(`${origin}/api/v1/auth/me`, { headers: { cookie } });
		expect(afterLogout.status).toBe(401);
	});
});

function unreachableRuntime(): SupportRuntimePort {
	return {
		async run(): Promise<SupportResult> {
			throw new Error("Runtime must not be called by this test.");
		},
	};
}
