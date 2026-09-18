import { describe, expect, it } from "vitest";
import { enterpriseApplicationConfigFromEnv } from "../src/enterprise/application.ts";
import { seedPortfolioEnterpriseDemoData } from "../src/enterprise/demo-data.ts";
import { type IdentityRepository, InMemoryIdentityRepository, type Role } from "../src/enterprise/identity.ts";

describe("enterprise application configuration", () => {
	it("requires DATABASE_URL and rejects an invalid configured port", () => {
		expect(() => enterpriseApplicationConfigFromEnv({})).toThrow("DATABASE_URL is required");
		expect(() => enterpriseApplicationConfigFromEnv({ DATABASE_URL: "postgres://demo", PORT: "invalid" })).toThrow(
			"PORT must be a valid TCP port",
		);
	});

	it("uses explicit PostgreSQL configuration without production defaults", () => {
		expect(
			enterpriseApplicationConfigFromEnv({
				DATABASE_URL: "postgres://application-test",
				PORT: "4312",
			}),
		).toEqual({ databaseUrl: "postgres://application-test", host: "127.0.0.1", port: 4312 });
	});

	it("creates the complete expected synthetic portfolio identity graph on an empty repository", async () => {
		const repository = new InMemoryIdentityRepository();
		const seeded = await seedPortfolioEnterpriseDemoData(repository, new Date("2026-09-01T00:00:00.000Z"));

		expect(seeded.users).toMatchObject({
			alice: { id: "demo-user-alice-agent", email: "alice.agent@demo.example" },
			susan: { id: "demo-user-susan-supervisor", email: "susan.supervisor@demo.example" },
			bob: { id: "demo-user-bob-agent", email: "bob.agent@demo.example" },
			ava: { id: "demo-user-ava-admin", email: "ava.admin@demo.example" },
		});
		await expect(repository.listMembershipsForUser(seeded.users.alice.id)).resolves.toEqual([
			expect.objectContaining({
				id: "demo-membership-alice-a1",
				tenantId: "demo-tenant-a",
				storeId: "demo-store-a1",
				role: "agent",
			}),
		]);
		await expect(repository.listMembershipsForUser(seeded.users.susan.id)).resolves.toEqual([
			expect.objectContaining({
				id: "demo-membership-susan-a1",
				tenantId: "demo-tenant-a",
				storeId: "demo-store-a1",
				role: "supervisor",
			}),
		]);
		await expect(repository.listMembershipsForUser(seeded.users.bob.id)).resolves.toEqual([
			expect.objectContaining({
				id: "demo-membership-bob-b1",
				tenantId: "demo-tenant-b",
				storeId: "demo-store-b1",
				role: "agent",
			}),
		]);
		await expect(repository.listMembershipsForUser(seeded.users.ava.id)).resolves.toEqual([
			expect.objectContaining({
				id: "demo-membership-ava-a1",
				tenantId: "demo-tenant-a",
				storeId: "demo-store-a1",
				role: "admin",
			}),
		]);
	});

	it("keeps the complete synthetic portfolio seed repeat-safe", async () => {
		const repository = new InMemoryIdentityRepository();
		const first = await seedPortfolioEnterpriseDemoData(repository, new Date("2026-09-01T00:00:00.000Z"));
		const second = await seedPortfolioEnterpriseDemoData(repository, new Date("2026-09-02T00:00:00.000Z"));

		expect(second.users).toEqual(first.users);
		await expect(repository.listMembershipsForUser(first.users.alice.id)).resolves.toHaveLength(1);
		await expect(repository.listMembershipsForUser(first.users.susan.id)).resolves.toHaveLength(1);
		await expect(repository.listMembershipsForUser(first.users.bob.id)).resolves.toHaveLength(1);
		await expect(repository.listMembershipsForUser(first.users.ava.id)).resolves.toHaveLength(1);
	});

	it("upgrades only the exact legacy three-person graph by adding Ava's fixed admin membership", async () => {
		const repository = new InMemoryIdentityRepository();
		await createExistingDemoGraph(repository);

		const seeded = await seedPortfolioEnterpriseDemoData(repository);

		expect(seeded.users.ava).toMatchObject({ id: "demo-user-ava-admin", email: "ava.admin@demo.example" });
		await expect(repository.listMembershipsForUser(seeded.users.ava.id)).resolves.toEqual([
			expect.objectContaining({ id: "demo-membership-ava-a1", role: "admin" }),
		]);
		await expect(repository.listMembershipsForUser(seeded.users.alice.id)).resolves.toHaveLength(1);
	});

	it.each([
		["missing membership", { includeAva: true, omitMembershipFor: "ava" as const }],
		["wrong role", { includeAva: true, avaRole: "agent" as const }],
		["wrong scope", { includeAva: true, avaScope: "b1" as const }],
		["extra membership", { includeAva: true, additionalAvaMembership: true }],
		["unexpected user ID", { includeAva: true, avaUserId: "unexpected-demo-user" }],
	])("rejects a four-person graph with Ava's %s", async (_reason, options) => {
		const repository = new InMemoryIdentityRepository();
		await createExistingDemoGraph(repository, options);

		await expect(seedPortfolioEnterpriseDemoData(repository)).rejects.toThrow(seedInconsistencyMessage);
	});

	it("rejects a partial deterministic user population instead of auto-completing it", async () => {
		const repository = new InMemoryIdentityRepository();
		await repository.createUser(demoUser("alice"));

		await expect(seedPortfolioEnterpriseDemoData(repository)).rejects.toThrow(seedInconsistencyMessage);
		await expect(repository.findUserByEmail("susan.supervisor@demo.example")).resolves.toBeUndefined();
		await expect(repository.findUserByEmail("bob.agent@demo.example")).resolves.toBeUndefined();
	});

	it("rejects an existing deterministic user graph with Bob's required membership missing", async () => {
		const repository = new InMemoryIdentityRepository();
		await createExistingDemoGraph(repository, { omitMembershipFor: "bob" });

		await expect(seedPortfolioEnterpriseDemoData(repository)).rejects.toThrow(seedInconsistencyMessage);
	});

	it("rejects an existing deterministic user graph with the wrong role", async () => {
		const repository = new InMemoryIdentityRepository();
		await createExistingDemoGraph(repository, { aliceRole: "supervisor" });

		await expect(seedPortfolioEnterpriseDemoData(repository)).rejects.toThrow(seedInconsistencyMessage);
	});

	it("rejects an existing deterministic user graph with Bob assigned to the wrong scope", async () => {
		const repository = new InMemoryIdentityRepository();
		await createExistingDemoGraph(repository, { bobScope: "a1" });

		await expect(seedPortfolioEnterpriseDemoData(repository)).rejects.toThrow(seedInconsistencyMessage);
	});

	it("rejects an existing deterministic user graph with multiple memberships", async () => {
		const repository = new InMemoryIdentityRepository();
		await createExistingDemoGraph(repository, { additionalAliceMembership: true });

		await expect(seedPortfolioEnterpriseDemoData(repository)).rejects.toThrow(seedInconsistencyMessage);
	});

	it("rejects an expected email resolved to an unexpected deterministic user identity", async () => {
		const repository = new InMemoryIdentityRepository();
		await createExistingDemoGraph(repository, { aliceUserId: "unexpected-demo-user" });

		await expect(seedPortfolioEnterpriseDemoData(repository)).rejects.toThrow(seedInconsistencyMessage);
	});
});

type DemoUserKey = "alice" | "susan" | "bob" | "ava";
const seedInconsistencyMessage = "Portfolio enterprise demo seed is partial or inconsistent.";

async function createExistingDemoGraph(
	repository: IdentityRepository,
	options: {
		omitMembershipFor?: DemoUserKey;
		aliceRole?: Role;
		bobScope?: "a1";
		additionalAliceMembership?: boolean;
		aliceUserId?: string;
		includeAva?: boolean;
		avaRole?: Role;
		avaScope?: "b1";
		additionalAvaMembership?: boolean;
		avaUserId?: string;
	} = {},
): Promise<void> {
	const createdAt = new Date("2026-09-01T00:00:00.000Z");
	await repository.createTenant({ id: "demo-tenant-a", name: "Demo Retail Group A", createdAt });
	await repository.createTenant({ id: "demo-tenant-b", name: "Demo Retail Group B", createdAt });
	await repository.createStore({ id: "demo-store-a1", tenantId: "demo-tenant-a", name: "Store A1", createdAt });
	await repository.createStore({ id: "demo-store-b1", tenantId: "demo-tenant-b", name: "Store B1", createdAt });

	const alice = demoUser("alice", options.aliceUserId);
	const susan = demoUser("susan");
	const bob = demoUser("bob");
	const ava = options.includeAva ? demoUser("ava", options.avaUserId) : undefined;
	await repository.createUser(alice);
	await repository.createUser(susan);
	await repository.createUser(bob);
	if (ava) await repository.createUser(ava);

	if (options.omitMembershipFor !== "alice") {
		await repository.createMembership({
			id: "demo-membership-alice-a1",
			userId: alice.id,
			tenantId: "demo-tenant-a",
			storeId: "demo-store-a1",
			role: options.aliceRole ?? "agent",
			createdAt,
		});
	}
	if (options.omitMembershipFor !== "susan") {
		await repository.createMembership({
			id: "demo-membership-susan-a1",
			userId: susan.id,
			tenantId: "demo-tenant-a",
			storeId: "demo-store-a1",
			role: "supervisor",
			createdAt,
		});
	}
	if (options.omitMembershipFor !== "bob") {
		await repository.createMembership({
			id: "demo-membership-bob-b1",
			userId: bob.id,
			tenantId: options.bobScope === "a1" ? "demo-tenant-a" : "demo-tenant-b",
			storeId: options.bobScope === "a1" ? "demo-store-a1" : "demo-store-b1",
			role: "agent",
			createdAt,
		});
	}
	if (options.additionalAliceMembership) {
		await repository.createMembership({
			id: "additional-membership-alice-b1",
			userId: alice.id,
			tenantId: "demo-tenant-b",
			storeId: "demo-store-b1",
			role: "agent",
			createdAt,
		});
	}
	if (ava && options.omitMembershipFor !== "ava") {
		await repository.createMembership({
			id: "demo-membership-ava-a1",
			userId: ava.id,
			tenantId: options.avaScope === "b1" ? "demo-tenant-b" : "demo-tenant-a",
			storeId: options.avaScope === "b1" ? "demo-store-b1" : "demo-store-a1",
			role: options.avaRole ?? "admin",
			createdAt,
		});
	}
	if (ava && options.additionalAvaMembership) {
		await repository.createMembership({
			id: "additional-membership-ava-b1",
			userId: ava.id,
			tenantId: "demo-tenant-b",
			storeId: "demo-store-b1",
			role: "admin",
			createdAt,
		});
	}
}

function demoUser(key: DemoUserKey, id?: string) {
	const values = {
		alice: { id: "demo-user-alice-agent", email: "alice.agent@demo.example", displayName: "Alice Agent" },
		susan: {
			id: "demo-user-susan-supervisor",
			email: "susan.supervisor@demo.example",
			displayName: "Susan Supervisor",
		},
		bob: { id: "demo-user-bob-agent", email: "bob.agent@demo.example", displayName: "Bob Agent" },
		ava: { id: "demo-user-ava-admin", email: "ava.admin@demo.example", displayName: "Ava Admin" },
	}[key];
	return {
		...values,
		id: id ?? values.id,
		passwordHash: "not-used-by-seed-validation",
		createdAt: new Date("2026-09-01T00:00:00.000Z"),
	};
}
