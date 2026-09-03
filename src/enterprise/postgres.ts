import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Pool, PoolClient } from "pg";
import type {
	ConversationRecord,
	EnterpriseBusinessRepository,
	PersistentAuditEventRecord,
	PersistentHandoffRecord,
	PersistentTicketRecord,
} from "./business.ts";
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

type EnterpriseMigration = {
	id: string;
	path: URL;
};

const identityMigration: EnterpriseMigration = {
	id: "001_enterprise_identity",
	path: new URL("../../migrations/001_enterprise_identity.sql", import.meta.url),
};

const businessMigration: EnterpriseMigration = {
	id: "002_support_business_persistence",
	path: new URL("../../migrations/002_support_business_persistence.sql", import.meta.url),
};

export async function applyEnterpriseIdentityMigrations(pool: Pool): Promise<void> {
	await applyEnterpriseMigrations(pool, [identityMigration]);
}

export async function applyEnterpriseBusinessMigrations(pool: Pool): Promise<void> {
	await applyEnterpriseMigrations(pool, [identityMigration, businessMigration]);
}

async function applyEnterpriseMigrations(pool: Pool, migrations: readonly EnterpriseMigration[]): Promise<void> {
	const client = await pool.connect();
	try {
		for (const migration of migrations) await applyMigrationOnce(client, migration);
	} finally {
		client.release();
	}
}

async function applyMigrationOnce(client: PoolClient, migration: EnterpriseMigration): Promise<void> {
	await client.query("BEGIN");
	try {
		await client.query(
			"CREATE TABLE IF NOT EXISTS enterprise_schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL)",
		);
		await client.query("LOCK TABLE enterprise_schema_migrations IN EXCLUSIVE MODE");
		const existing = await client.query<{ id: string }>("SELECT id FROM enterprise_schema_migrations WHERE id = $1", [
			migration.id,
		]);
		if ((existing.rowCount ?? 0) === 0) {
			const sql = readFileSync(fileURLToPath(migration.path), "utf8");
			await client.query(sql);
			await client.query("INSERT INTO enterprise_schema_migrations (id, applied_at) VALUES ($1, NOW())", [
				migration.id,
			]);
		}
		await client.query("COMMIT");
	} catch (error) {
		await client.query("ROLLBACK").catch(() => undefined);
		throw error;
	}
}

export class PostgresEnterpriseBusinessRepository implements EnterpriseBusinessRepository {
	private readonly pool: Pool;

	constructor(pool: Pool) {
		this.pool = pool;
	}

	async findConversationById(conversationId: string): Promise<ConversationRecord | undefined> {
		const result = await this.pool.query("SELECT * FROM conversations WHERE id = $1", [conversationId]);
		return result.rows[0] ? conversationFromRow(result.rows[0]) : undefined;
	}

	async createConversation(conversation: ConversationRecord): Promise<ConversationRecord> {
		const result = await this.pool.query(
			"INSERT INTO conversations (id, tenant_id, store_id, customer_id, pi_session_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
			[
				conversation.id,
				conversation.tenantId,
				conversation.storeId,
				conversation.customerId,
				conversation.piSessionId ?? null,
				conversation.createdAt,
				conversation.updatedAt,
			],
		);
		return conversationFromRow(result.rows[0]!);
	}

	async setConversationPiSession(conversationId: string, piSessionId: string, updatedAt: Date): Promise<void> {
		const result = await this.pool.query(
			"UPDATE conversations SET pi_session_id = $2, updated_at = $3 WHERE id = $1",
			[conversationId, piSessionId, updatedAt],
		);
		if (result.rowCount !== 1) throw new Error("Conversation not found while persisting Pi session mapping.");
	}

	async listConversations(tenantId: string, storeId: string): Promise<ConversationRecord[]> {
		const result = await this.pool.query(
			"SELECT * FROM conversations WHERE tenant_id = $1 AND store_id = $2 ORDER BY created_at DESC, id",
			[tenantId, storeId],
		);
		return result.rows.map(conversationFromRow);
	}

	async findTicket(tenantId: string, idempotencyKey: string): Promise<PersistentTicketRecord | undefined> {
		const result = await this.pool.query("SELECT * FROM tickets WHERE tenant_id = $1 AND idempotency_key = $2", [
			tenantId,
			idempotencyKey,
		]);
		return result.rows[0] ? ticketFromRow(result.rows[0]) : undefined;
	}

	async createTicket(
		input: Omit<PersistentTicketRecord, "id" | "createdAt">,
	): Promise<{ ticket: PersistentTicketRecord; duplicate: boolean }> {
		const inserted = await this.pool.query(
			"INSERT INTO tickets (tenant_id, store_id, conversation_id, summary, idempotency_key, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING *",
			[input.tenantId, input.storeId, input.conversationId, input.summary, input.idempotencyKey],
		);
		if (inserted.rows[0]) return { ticket: ticketFromRow(inserted.rows[0]), duplicate: false };
		const existing = await this.findTicket(input.tenantId, input.idempotencyKey);
		if (!existing) throw new Error("Ticket insert did not return a persisted record.");
		return { ticket: existing, duplicate: true };
	}

	async findHandoff(
		tenantId: string,
		storeId: string,
		conversationId: string,
	): Promise<PersistentHandoffRecord | undefined> {
		const result = await this.pool.query(
			"SELECT * FROM handoffs WHERE tenant_id = $1 AND store_id = $2 AND conversation_id = $3",
			[tenantId, storeId, conversationId],
		);
		return result.rows[0] ? handoffFromRow(result.rows[0]) : undefined;
	}

	async createHandoff(
		input: Omit<PersistentHandoffRecord, "id" | "createdAt">,
	): Promise<{ handoff: PersistentHandoffRecord; duplicate: boolean }> {
		const inserted = await this.pool.query(
			"INSERT INTO handoffs (tenant_id, store_id, conversation_id, reason, created_at) VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (tenant_id, store_id, conversation_id) DO NOTHING RETURNING *",
			[input.tenantId, input.storeId, input.conversationId, input.reason],
		);
		if (inserted.rows[0]) return { handoff: handoffFromRow(inserted.rows[0]), duplicate: false };
		const existing = await this.findHandoff(input.tenantId, input.storeId, input.conversationId);
		if (!existing) throw new Error("Handoff insert did not return a persisted record.");
		return { handoff: existing, duplicate: true };
	}

	async recordAudit(input: Omit<PersistentAuditEventRecord, "id" | "createdAt">): Promise<void> {
		await this.pool.query(
			"INSERT INTO audit_events (tenant_id, store_id, conversation_id, event_type, payload, created_at) VALUES ($1, $2, $3, $4, $5::jsonb, NOW())",
			[input.tenantId, input.storeId, input.conversationId ?? null, input.eventType, JSON.stringify(input.payload)],
		);
	}

	async listTickets(tenantId: string, storeId: string): Promise<PersistentTicketRecord[]> {
		const result = await this.pool.query(
			"SELECT * FROM tickets WHERE tenant_id = $1 AND store_id = $2 ORDER BY created_at DESC, id",
			[tenantId, storeId],
		);
		return result.rows.map(ticketFromRow);
	}

	async listHandoffs(tenantId: string, storeId: string): Promise<PersistentHandoffRecord[]> {
		const result = await this.pool.query(
			"SELECT * FROM handoffs WHERE tenant_id = $1 AND store_id = $2 ORDER BY created_at DESC, id",
			[tenantId, storeId],
		);
		return result.rows.map(handoffFromRow);
	}

	async listAuditEvents(tenantId: string, storeId: string): Promise<PersistentAuditEventRecord[]> {
		const result = await this.pool.query(
			"SELECT * FROM audit_events WHERE tenant_id = $1 AND store_id = $2 ORDER BY created_at DESC, id",
			[tenantId, storeId],
		);
		return result.rows.map(auditEventFromRow);
	}
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

function optionalStringValue(value: unknown): string | undefined {
	return value === null || value === undefined ? undefined : stringValue(value);
}

function conversationFromRow(row: Record<string, unknown>): ConversationRecord {
	return {
		id: stringValue(row.id),
		tenantId: stringValue(row.tenant_id),
		storeId: stringValue(row.store_id),
		customerId: stringValue(row.customer_id),
		piSessionId: optionalStringValue(row.pi_session_id),
		createdAt: dateValue(row.created_at),
		updatedAt: dateValue(row.updated_at),
	};
}

function ticketFromRow(row: Record<string, unknown>): PersistentTicketRecord {
	return {
		id: stringValue(row.id),
		tenantId: stringValue(row.tenant_id),
		storeId: stringValue(row.store_id),
		conversationId: stringValue(row.conversation_id),
		summary: stringValue(row.summary),
		idempotencyKey: stringValue(row.idempotency_key),
		createdAt: dateValue(row.created_at),
	};
}

function handoffFromRow(row: Record<string, unknown>): PersistentHandoffRecord {
	return {
		id: stringValue(row.id),
		tenantId: stringValue(row.tenant_id),
		storeId: stringValue(row.store_id),
		conversationId: stringValue(row.conversation_id),
		reason: stringValue(row.reason),
		createdAt: dateValue(row.created_at),
	};
}

function auditEventFromRow(row: Record<string, unknown>): PersistentAuditEventRecord {
	const payload = row.payload;
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		throw new Error("Database audit event has invalid payload.");
	}
	return {
		id: stringValue(row.id),
		tenantId: stringValue(row.tenant_id),
		storeId: stringValue(row.store_id),
		conversationId: stringValue(row.conversation_id),
		eventType: stringValue(row.event_type) as "support-agent.audit",
		payload: payload as Record<string, unknown>,
		createdAt: dateValue(row.created_at),
	};
}
