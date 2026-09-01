import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EnterpriseAuthService, hashSessionToken } from "../src/enterprise/auth.ts";
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

	it("applies the migration and persists the complete synthetic identity scope", async () => {
		const tables = await pool.query<{ table_name: string }>(
			"SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])",
			[["users", "tenants", "stores", "memberships", "auth_sessions"]],
		);
		expect(tables.rows.map((row) => row.table_name).sort()).toEqual([
			"auth_sessions",
			"memberships",
			"stores",
			"tenants",
			"users",
		]);
		const counts = await pool.query<{ users: string; tenants: string; stores: string; memberships: string }>(
			"SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM tenants) AS tenants, (SELECT count(*) FROM stores) AS stores, (SELECT count(*) FROM memberships) AS memberships",
		);
		expect(counts.rows[0]).toEqual({ users: "3", tenants: "2", stores: "2", memberships: "3" });
	});

	it("persists only Alice's session-token hash and resolves only Tenant A / Store A1", async () => {
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

	it("resolves Bob only to Tenant B / Store B1", async () => {
		const auth = new EnterpriseAuthService(repository);
		const login = await auth.login(demo.credentials.bob.email, demo.credentials.bob.password);
		expect(login).toBeDefined();
		expect(await auth.resolveExecutionContext(login!.token, "postgres-bob-context")).toMatchObject({
			scope: { tenantId: demo.tenants.b.id, storeId: demo.stores.b1.id },
		});
		expect(await repository.findMembership(demo.users.bob.id, demo.tenants.a.id, demo.stores.a1.id)).toBeUndefined();
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

	it("deletes a PostgreSQL-backed session on logout", async () => {
		const auth = new EnterpriseAuthService(repository);
		const login = await auth.login(demo.credentials.alice.email, demo.credentials.alice.password);
		expect(login).toBeDefined();
		await auth.logout(login!.token);
		expect(await auth.resolveExecutionContext(login!.token, "postgres-after-logout")).toBeUndefined();
		expect(await repository.findAuthSessionByTokenHash(hashSessionToken(login!.token))).toBeUndefined();
	});

	it("rejects and removes an expired PostgreSQL-backed session", async () => {
		const issuedAt = new Date("2026-08-31T00:00:00.000Z");
		const issuingAuth = new EnterpriseAuthService(repository, { now: () => issuedAt, sessionTtlMs: 60_000 });
		const login = await issuingAuth.login(demo.credentials.alice.email, demo.credentials.alice.password);
		expect(login).toBeDefined();
		const expiredAuth = new EnterpriseAuthService(repository, {
			now: () => new Date(issuedAt.getTime() + 61_000),
			sessionTtlMs: 60_000,
		});
		expect(await expiredAuth.resolveExecutionContext(login!.token, "postgres-expired")).toBeUndefined();
		const sessions = await repository.findAuthSessionByUserId(demo.users.alice.id);
		expect(sessions.some((session) => session.tokenHash === hashSessionToken(login!.token))).toBe(false);
	});
});
