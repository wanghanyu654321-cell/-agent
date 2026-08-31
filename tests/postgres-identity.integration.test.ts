import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EnterpriseAuthService } from "../src/enterprise/auth.ts";
import { seedPortfolioEnterpriseDemoData } from "../src/enterprise/demo-data.ts";
import { applyEnterpriseIdentityMigrations, PostgresIdentityRepository } from "../src/enterprise/postgres.ts";

const postgresTestUrl = process.env.POSTGRES_TEST_URL;
const describePostgres = postgresTestUrl ? describe : describe.skip;

describePostgres("PostgreSQL enterprise identity integration", () => {
	const pool = new Pool({ connectionString: postgresTestUrl });
	const repository = new PostgresIdentityRepository(pool);
	let demo: Awaited<ReturnType<typeof seedPortfolioEnterpriseDemoData>>;

	beforeAll(async () => {
		await applyEnterpriseIdentityMigrations(pool);
		await pool.query(
			"TRUNCATE audit_events, handoffs, tickets, conversations, auth_sessions, memberships, stores, users, tenants",
		);
		demo = await seedPortfolioEnterpriseDemoData(repository, new Date("2026-08-31T00:00:00.000Z"));
	});

	afterAll(async () => {
		await pool.end();
	});

	it("persists a hashed auth session and resolves only Alice's tenant/store membership", async () => {
		const auth = new EnterpriseAuthService(repository);
		const login = await auth.login(demo.credentials.alice.email, demo.credentials.alice.password);
		expect(login).toBeDefined();
		const sessions = await repository.findAuthSessionByUserId(demo.users.alice.id);
		expect(sessions).toHaveLength(1);
		expect(sessions[0]?.tokenHash).not.toBe(login?.token);
		expect(await auth.resolveExecutionContext(login!.token, "postgres-context")).toMatchObject({
			scope: { tenantId: demo.tenants.a.id, storeId: demo.stores.a1.id },
		});
		expect(
			await repository.findMembership(demo.users.alice.id, demo.tenants.b.id, demo.stores.b1.id),
		).toBeUndefined();
	});

	it("enforces the store-tenant relationship in PostgreSQL", async () => {
		await expect(
			repository.createMembership({
				id: "postgres-invalid-store-tenant",
				userId: demo.users.alice.id,
				tenantId: demo.tenants.a.id,
				storeId: demo.stores.b1.id,
				role: "agent",
				createdAt: new Date("2026-08-31T00:00:00.000Z"),
			}),
		).rejects.toThrow();
	});
});
