import { hashPassword } from "./auth.ts";
import type { IdentityRepository, Store, Tenant, User } from "./identity.ts";

export const portfolioEnterpriseDemoDisclaimer =
	"DEMO / SYNTHETIC PORTFOLIO IDENTITIES — NOT PRODUCTION USERS OR CREDENTIALS.";

export interface PortfolioEnterpriseDemoData {
	tenants: { a: Tenant; b: Tenant };
	stores: { a1: Store; b1: Store };
	users: { alice: User; susan: User; bob: User };
	credentials: {
		alice: { email: string; password: string };
		susan: { email: string; password: string };
		bob: { email: string; password: string };
	};
}

export async function seedPortfolioEnterpriseDemoData(
	repository: IdentityRepository,
	createdAt = new Date(),
): Promise<PortfolioEnterpriseDemoData> {
	const credentials = {
		alice: { email: "alice.agent@demo.example", password: "AliceDemo!2026" },
		susan: { email: "susan.supervisor@demo.example", password: "SusanDemo!2026" },
		bob: { email: "bob.agent@demo.example", password: "BobDemo!2026" },
	};
	const tenants = {
		a: { id: "demo-tenant-a", name: "Demo Retail Group A", createdAt },
		b: { id: "demo-tenant-b", name: "Demo Retail Group B", createdAt },
	};
	const stores = {
		a1: { id: "demo-store-a1", tenantId: tenants.a.id, name: "Store A1", createdAt },
		b1: { id: "demo-store-b1", tenantId: tenants.b.id, name: "Store B1", createdAt },
	};
	const existingAlice = await repository.findUserByEmail(credentials.alice.email);
	const existingSusan = await repository.findUserByEmail(credentials.susan.email);
	const existingBob = await repository.findUserByEmail(credentials.bob.email);
	if (existingAlice && existingSusan && existingBob) {
		return {
			tenants,
			stores,
			users: { alice: existingAlice, susan: existingSusan, bob: existingBob },
			credentials,
		};
	}
	const users = {
		alice: {
			id: "demo-user-alice-agent",
			email: credentials.alice.email,
			displayName: "Alice Agent",
			passwordHash: await hashPassword(credentials.alice.password),
			createdAt,
		},
		susan: {
			id: "demo-user-susan-supervisor",
			email: credentials.susan.email,
			displayName: "Susan Supervisor",
			passwordHash: await hashPassword(credentials.susan.password),
			createdAt,
		},
		bob: {
			id: "demo-user-bob-agent",
			email: credentials.bob.email,
			displayName: "Bob Agent",
			passwordHash: await hashPassword(credentials.bob.password),
			createdAt,
		},
	};
	await repository.createTenant(tenants.a);
	await repository.createTenant(tenants.b);
	await repository.createStore(stores.a1);
	await repository.createStore(stores.b1);
	await repository.createUser(users.alice);
	await repository.createUser(users.susan);
	await repository.createUser(users.bob);
	await repository.createMembership({
		id: "demo-membership-alice-a1",
		userId: users.alice.id,
		tenantId: tenants.a.id,
		storeId: stores.a1.id,
		role: "agent",
		createdAt,
	});
	await repository.createMembership({
		id: "demo-membership-susan-a1",
		userId: users.susan.id,
		tenantId: tenants.a.id,
		storeId: stores.a1.id,
		role: "supervisor",
		createdAt,
	});
	await repository.createMembership({
		id: "demo-membership-bob-b1",
		userId: users.bob.id,
		tenantId: tenants.b.id,
		storeId: stores.b1.id,
		role: "agent",
		createdAt,
	});
	return { tenants, stores, users, credentials };
}
