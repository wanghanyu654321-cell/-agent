import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import {
	type AuthSession,
	type IdentityRepository,
	isRole,
	type Membership,
	type Store,
	type Tenant,
	type User,
} from "./identity.ts";

export class PostgresIdentityRepository implements IdentityRepository {
	private readonly pool: Pool;

	constructor(pool: Pool) {
		this.pool = pool;
	}

	async createUser(user: User): Promise<void> {
		await this.pool.query(
			"INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)",
			[user.id, user.email.trim().toLowerCase(), user.displayName, user.passwordHash, user.createdAt],
		);
	}

	async createTenant(tenant: Tenant): Promise<void> {
		await this.pool.query("INSERT INTO tenants (id, name, created_at) VALUES ($1, $2, $3)", [
			tenant.id,
			tenant.name,
			tenant.createdAt,
		]);
	}

	async createStore(store: Store): Promise<void> {
		await this.pool.query("INSERT INTO stores (id, tenant_id, name, created_at) VALUES ($1, $2, $3, $4)", [
			store.id,
			store.tenantId,
			store.name,
			store.createdAt,
		]);
	}

	async createMembership(membership: Membership): Promise<void> {
		await this.pool.query(
			"INSERT INTO memberships (id, user_id, tenant_id, store_id, role, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
			[
				membership.id,
				membership.userId,
				membership.tenantId,
				membership.storeId,
				membership.role,
				membership.createdAt,
			],
		);
	}

	async createAuthSession(session: AuthSession): Promise<void> {
		await this.pool.query(
			"INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, created_at) VALUES ($1, $2, $3, $4, $5)",
			[session.id, session.userId, session.tokenHash, session.expiresAt, session.createdAt],
		);
	}

	async findUserByEmail(email: string): Promise<User | undefined> {
		const result = await this.pool.query("SELECT * FROM users WHERE email = $1", [email.trim().toLowerCase()]);
		return result.rows[0] ? userFromRow(result.rows[0]) : undefined;
	}

	async findUserById(userId: string): Promise<User | undefined> {
		const result = await this.pool.query("SELECT * FROM users WHERE id = $1", [userId]);
		return result.rows[0] ? userFromRow(result.rows[0]) : undefined;
	}

	async findAuthSessionByTokenHash(tokenHash: string): Promise<AuthSession | undefined> {
		const result = await this.pool.query("SELECT * FROM auth_sessions WHERE token_hash = $1", [tokenHash]);
		return result.rows[0] ? sessionFromRow(result.rows[0]) : undefined;
	}

	async findAuthSessionByUserId(userId: string): Promise<AuthSession[]> {
		const result = await this.pool.query("SELECT * FROM auth_sessions WHERE user_id = $1 ORDER BY created_at", [
			userId,
		]);
		return result.rows.map(sessionFromRow);
	}

	async deleteAuthSessionByTokenHash(tokenHash: string): Promise<void> {
		await this.pool.query("DELETE FROM auth_sessions WHERE token_hash = $1", [tokenHash]);
	}

	async findMembership(userId: string, tenantId: string, storeId: string): Promise<Membership | undefined> {
		const result = await this.pool.query(
			"SELECT * FROM memberships WHERE user_id = $1 AND tenant_id = $2 AND store_id = $3",
			[userId, tenantId, storeId],
		);
		return result.rows[0] ? membershipFromRow(result.rows[0]) : undefined;
	}

	async listMembershipsForUser(userId: string): Promise<Membership[]> {
		const result = await this.pool.query("SELECT * FROM memberships WHERE user_id = $1 ORDER BY id", [userId]);
		return result.rows.map(membershipFromRow);
	}
}

export async function applyEnterpriseIdentityMigrations(pool: Pool): Promise<void> {
	const migrationPath = fileURLToPath(new URL("../../migrations/001_enterprise_identity.sql", import.meta.url));
	const sql = readFileSync(migrationPath, "utf8");
	await pool.query(sql);
}

function userFromRow(row: Record<string, unknown>): User {
	return {
		id: stringValue(row.id),
		email: stringValue(row.email),
		displayName: stringValue(row.display_name),
		passwordHash: stringValue(row.password_hash),
		createdAt: dateValue(row.created_at),
	};
}

function sessionFromRow(row: Record<string, unknown>): AuthSession {
	return {
		id: stringValue(row.id),
		userId: stringValue(row.user_id),
		tokenHash: stringValue(row.token_hash).trim(),
		expiresAt: dateValue(row.expires_at),
		createdAt: dateValue(row.created_at),
	};
}

function membershipFromRow(row: Record<string, unknown>): Membership {
	const role = stringValue(row.role);
	if (!isRole(role)) throw new Error("Database membership role is invalid.");
	return {
		id: stringValue(row.id),
		userId: stringValue(row.user_id),
		tenantId: stringValue(row.tenant_id),
		storeId: stringValue(row.store_id),
		role,
		createdAt: dateValue(row.created_at),
	};
}

function stringValue(value: unknown): string {
	if (typeof value !== "string") throw new Error("Database row has invalid string value.");
	return value;
}

function dateValue(value: unknown): Date {
	const date = value instanceof Date ? value : new Date(String(value));
	if (Number.isNaN(date.getTime())) throw new Error("Database row has invalid date value.");
	return date;
}
