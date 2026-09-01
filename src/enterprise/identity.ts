export const roles = ["agent", "supervisor", "admin"] as const;
export type Role = (typeof roles)[number];

export const capabilities = [
	"agent:invoke",
	"conversation:read",
	"ticket:create",
	"handoff:create",
	"audit:read",
] as const;
export type Capability = (typeof capabilities)[number];

const roleCapabilities: Record<Role, readonly Capability[]> = {
	agent: ["agent:invoke", "conversation:read", "ticket:create"],
	supervisor: ["agent:invoke", "conversation:read", "ticket:create", "handoff:create"],
	admin: ["agent:invoke", "conversation:read", "ticket:create", "handoff:create", "audit:read"],
};

export interface User {
	id: string;
	email: string;
	displayName: string;
	passwordHash: string;
	createdAt: Date;
}

export interface Tenant {
	id: string;
	name: string;
	createdAt: Date;
}

export interface Store {
	id: string;
	tenantId: string;
	name: string;
	createdAt: Date;
}

export interface Membership {
	id: string;
	userId: string;
	tenantId: string;
	storeId: string;
	role: Role;
	createdAt: Date;
}

export interface AuthSession {
	id: string;
	userId: string;
	tokenHash: string;
	expiresAt: Date;
	createdAt: Date;
}

export interface SupportExecutionContext {
	actor: {
		userId: string;
		role: Role;
		capabilities: Capability[];
	};
	scope: {
		tenantId: string;
		storeId: string;
	};
	request: {
		requestId: string;
	};
}

export interface IdentityRepository {
	createUser(user: User): Promise<void>;
	createTenant(tenant: Tenant): Promise<void>;
	createStore(store: Store): Promise<void>;
	createMembership(membership: Membership): Promise<void>;
	createAuthSession(session: AuthSession): Promise<void>;
	findUserByEmail(email: string): Promise<User | undefined>;
	findUserById(userId: string): Promise<User | undefined>;
	findAuthSessionByTokenHash(tokenHash: string): Promise<AuthSession | undefined>;
	findAuthSessionByUserId(userId: string): Promise<AuthSession[]>;
	deleteAuthSessionByTokenHash(tokenHash: string): Promise<void>;
	findMembership(userId: string, tenantId: string, storeId: string): Promise<Membership | undefined>;
	listMembershipsForUser(userId: string): Promise<Membership[]>;
}

export function capabilitiesForRole(role: Role): Capability[] {
	return [...roleCapabilities[role]];
}

export function isRole(value: unknown): value is Role {
	return typeof value === "string" && (roles as readonly string[]).includes(value);
}

export function createSupportExecutionContext(membership: Membership, requestId: string): SupportExecutionContext {
	return {
		actor: {
			userId: membership.userId,
			role: membership.role,
			capabilities: capabilitiesForRole(membership.role),
		},
		scope: { tenantId: membership.tenantId, storeId: membership.storeId },
		request: { requestId },
	};
}

export class InMemoryIdentityRepository implements IdentityRepository {
	private readonly users = new Map<string, User>();
	private readonly usersByEmail = new Map<string, string>();
	private readonly tenants = new Map<string, Tenant>();
	private readonly stores = new Map<string, Store>();
	private readonly memberships = new Map<string, Membership>();
	private readonly sessions = new Map<string, AuthSession>();

	async createUser(user: User): Promise<void> {
		const email = normalizeEmail(user.email);
		if (this.users.has(user.id) || this.usersByEmail.has(email)) throw new Error("User already exists.");
		this.users.set(user.id, { ...user, email });
		this.usersByEmail.set(email, user.id);
	}

	async createTenant(tenant: Tenant): Promise<void> {
		if (this.tenants.has(tenant.id)) throw new Error("Tenant already exists.");
		this.tenants.set(tenant.id, { ...tenant });
	}

	async createStore(store: Store): Promise<void> {
		if (!this.tenants.has(store.tenantId)) throw new Error("Store tenant does not exist.");
		if (this.stores.has(store.id)) throw new Error("Store already exists.");
		this.stores.set(store.id, { ...store });
	}

	async createMembership(membership: Membership): Promise<void> {
		if (!isRole(membership.role)) throw new Error("Membership role is invalid.");
		if (!this.users.has(membership.userId)) throw new Error("Membership user does not exist.");
		if (!this.tenants.has(membership.tenantId)) throw new Error("Membership tenant does not exist.");
		const store = this.stores.get(membership.storeId);
		if (!store) throw new Error("Membership store does not exist.");
		if (store.tenantId !== membership.tenantId) throw new Error("Membership store does not belong to tenant.");
		if ([...this.memberships.values()].some((item) => sameMembership(item, membership))) {
			throw new Error("Membership already exists.");
		}
		this.memberships.set(membership.id, { ...membership });
	}

	async createAuthSession(session: AuthSession): Promise<void> {
		if (!this.users.has(session.userId)) throw new Error("Auth session user does not exist.");
		if (this.sessions.has(session.tokenHash)) throw new Error("Auth session token hash already exists.");
		this.sessions.set(session.tokenHash, { ...session });
	}

	async findUserByEmail(email: string): Promise<User | undefined> {
		const id = this.usersByEmail.get(normalizeEmail(email));
		const user = id ? this.users.get(id) : undefined;
		return user ? { ...user } : undefined;
	}

	async findUserById(userId: string): Promise<User | undefined> {
		const user = this.users.get(userId);
		return user ? { ...user } : undefined;
	}

	async findAuthSessionByTokenHash(tokenHash: string): Promise<AuthSession | undefined> {
		const session = this.sessions.get(tokenHash);
		return session ? { ...session } : undefined;
	}

	async findAuthSessionByUserId(userId: string): Promise<AuthSession[]> {
		return [...this.sessions.values()]
			.filter((session) => session.userId === userId)
			.map((session) => ({ ...session }));
	}

	async deleteAuthSessionByTokenHash(tokenHash: string): Promise<void> {
		this.sessions.delete(tokenHash);
	}

	async findMembership(userId: string, tenantId: string, storeId: string): Promise<Membership | undefined> {
		const membership = [...this.memberships.values()].find(
			(item) => item.userId === userId && item.tenantId === tenantId && item.storeId === storeId,
		);
		return membership ? { ...membership } : undefined;
	}

	async listMembershipsForUser(userId: string): Promise<Membership[]> {
		return [...this.memberships.values()]
			.filter((membership) => membership.userId === userId)
			.map((membership) => ({ ...membership }));
	}
}

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function sameMembership(left: Membership, right: Membership): boolean {
	return left.userId === right.userId && left.tenantId === right.tenantId && left.storeId === right.storeId;
}
