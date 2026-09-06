import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { type Capability, capabilitiesForRole, type SupportExecutionContext } from "../enterprise/identity.ts";
import {
	type AvailabilityDTO,
	type BookingIntentDTO,
	type BookingStatus,
	boundedId,
	type NeedsAttentionDTO,
	parseAvailabilityWrite,
	parseBookingCreate,
	parseBookingTransition,
	resolveTransition,
	StoreOpsError,
	validateDate,
	validateTimeZone,
} from "./contracts.ts";

export class PostgresStoreOpsRepository {
	constructor(private readonly pool: Pool) {}
	async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN");
			const value = await operation(client);
			await client.query("COMMIT");
			return value;
		} catch (error) {
			await client.query("ROLLBACK").catch(() => undefined);
			throw error;
		} finally {
			client.release();
		}
	}
}

type ActorMembership = {
	id: string;
	user_id: string;
	role: SupportExecutionContext["actor"]["role"];
	tenant_id: string;
	store_id: string;
};
export class StoreOpsService {
	constructor(
		private readonly repository: PostgresStoreOpsRepository,
		private readonly storeTimeZone: (scope: SupportExecutionContext["scope"]) => string | undefined,
	) {}

	private async authorized<T>(
		context: SupportExecutionContext,
		capability: Capability,
		operation: (client: PoolClient, actor: ActorMembership) => Promise<T>,
	): Promise<T> {
		if (!context.actor.capabilities.includes(capability)) throw new StoreOpsError("forbidden");
		return this.repository.transaction(async (client) => {
			// Re-read current authority under lock; a stale cookie context cannot authorize a mutation.
			const result = await client.query<ActorMembership>(
				"SELECT id, user_id, role, tenant_id, store_id FROM memberships WHERE user_id=$1 FOR SHARE",
				[context.actor.userId],
			);
			const actor = result.rows[0];
			if (
				result.rows.length !== 1 ||
				!actor ||
				actor.tenant_id !== context.scope.tenantId ||
				actor.store_id !== context.scope.storeId ||
				actor.role !== context.actor.role ||
				!capabilitiesForRole(actor.role).includes(capability)
			)
				throw new StoreOpsError("forbidden");
			return operation(client, actor);
		});
	}

	async listAvailability(
		context: SupportExecutionContext,
		date: string,
	): Promise<{ items: AvailabilityDTO[]; staff: { membershipId: string; displayName: string }[]; timeZone: string }> {
		validateDate(date);
		return this.authorized(context, "storeops:read", async (client) => {
			const timeZone = validateTimeZone(this.storeTimeZone(context.scope));
			const scope = [context.scope.tenantId, context.scope.storeId];
			const staff = await client.query<{ membershipId: string; displayName: string }>(
				`SELECT m.id AS "membershipId",u.display_name AS "displayName" FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.store_id=$2 ORDER BY m.id`,
				scope,
			);
			const rows = await client.query(
				`SELECT a.*,a.local_date::text AS local_date,u.display_name FROM daily_availability a JOIN memberships m ON m.id=a.staff_membership_id JOIN users u ON u.id=m.user_id WHERE a.tenant_id=$1 AND a.store_id=$2 AND a.local_date=$3 ORDER BY a.staff_membership_id`,
				[...scope, date],
			);
			return { items: rows.rows.map(availability), staff: staff.rows, timeZone };
		});
	}

	async putAvailability(
		context: SupportExecutionContext,
		staffMembershipId: string,
		date: string,
		input: unknown,
	): Promise<AvailabilityDTO> {
		boundedId(staffMembershipId);
		const data = parseAvailabilityWrite(date, input);
		return this.authorized(context, "availability:write", async (client, actor) => {
			const timeZone = validateTimeZone(this.storeTimeZone(context.scope));
			await scopedStaff(client, context, staffMembershipId);
			const scope = [context.scope.tenantId, context.scope.storeId];
			const common = [
				...scope,
				staffMembershipId,
				date,
				timeZone,
				JSON.stringify(data.windows),
				data.status,
				actor.id,
			];
			const result =
				data.expectedVersion === 0
					? await client.query(
							`INSERT INTO daily_availability(id,tenant_id,store_id,staff_membership_id,local_date,time_zone,windows,status,source,version,updated_by_membership_id,created_at,updated_at) VALUES($9,$1,$2,$3,$4,$5,$6::jsonb,$7,'human',1,$8,NOW(),NOW()) ON CONFLICT(tenant_id,store_id,staff_membership_id,local_date) DO NOTHING RETURNING *,local_date::text AS local_date`,
							[...common, randomUUID()],
						)
					: await client.query(
							`UPDATE daily_availability SET time_zone=$5,windows=$6::jsonb,status=$7,updated_by_membership_id=$8,version=version+1,updated_at=NOW() WHERE tenant_id=$1 AND store_id=$2 AND staff_membership_id=$3 AND local_date=$4 AND version=$9 RETURNING *,local_date::text AS local_date`,
							[...common, data.expectedVersion],
						);
			if (!result.rows[0]) throw new StoreOpsError("availability_conflict");
			const name = await client.query<{ display_name: string }>(
				"SELECT u.display_name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.id=$1",
				[staffMembershipId],
			);
			return availability({ ...result.rows[0], display_name: name.rows[0]!.display_name });
		});
	}

	async createBookingIntent(
		context: SupportExecutionContext,
		idempotencyKey: string,
		input: unknown,
	): Promise<{ intent: BookingIntentDTO; duplicate: boolean }> {
		boundedId(idempotencyKey);
		const data = parseBookingCreate(input);
		return this.authorized(context, "booking-intent:create", async (client, actor) => {
			const scope = [context.scope.tenantId, context.scope.storeId];
			const conversation = await client.query<{ customer_id: string }>(
				"SELECT customer_id FROM conversations WHERE tenant_id=$1 AND store_id=$2 AND id=$3 FOR SHARE",
				[...scope, data.conversationId],
			);
			if (!conversation.rows[0]) throw new StoreOpsError("not_found");
			if (data.preferredStaffMembershipId) await scopedStaff(client, context, data.preferredStaffMembershipId);
			const bindings = await client.query<{ binding_id: string }>(
				"SELECT DISTINCT binding_id FROM wecom_inbound_messages WHERE tenant_id=$1 AND store_id=$2 AND conversation_id=$3 AND binding_id IS NOT NULL",
				[...scope, data.conversationId],
			);
			if (bindings.rows.length > 1) throw new StoreOpsError("booking_intent_conflict");
			const bindingId = bindings.rows[0]?.binding_id ?? null;
			const hash = createHash("sha256")
				.update(
					JSON.stringify([
						data.conversationId,
						data.requestedService,
						data.requestedStart ?? null,
						data.requestedEnd ?? null,
						data.preferredStaffMembershipId ?? null,
						bindingId,
						actor.id,
					]),
				)
				.digest("hex");
			const inserted = await client.query(
				`INSERT INTO booking_intents(id,tenant_id,store_id,conversation_id,customer_id,channel_binding_id,requested_service,requested_start,requested_end,preferred_staff_membership_id,status,created_by_membership_id,updated_by_membership_id,idempotency_key,create_request_hash,version,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending_confirmation',$11,$11,$12,$13,1,NOW(),NOW()) ON CONFLICT(tenant_id,store_id,idempotency_key) DO NOTHING RETURNING *`,
				[
					randomUUID(),
					...scope,
					data.conversationId,
					conversation.rows[0].customer_id,
					bindingId,
					data.requestedService,
					data.requestedStart ?? null,
					data.requestedEnd ?? null,
					data.preferredStaffMembershipId ?? null,
					actor.id,
					idempotencyKey,
					hash,
				],
			);
			const existing =
				inserted.rows[0] ??
				(
					await client.query(
						"SELECT * FROM booking_intents WHERE tenant_id=$1 AND store_id=$2 AND idempotency_key=$3 FOR SHARE",
						[...scope, idempotencyKey],
					)
				).rows[0];
			if (!existing || existing.create_request_hash !== hash) throw new StoreOpsError("booking_intent_conflict");
			return {
				intent: booking({ ...existing, creator_user_id: actor.user_id }),
				duplicate: inserted.rows.length === 0,
			};
		});
	}

	async transitionBookingIntent(
		context: SupportExecutionContext,
		id: string,
		input: unknown,
	): Promise<BookingIntentDTO> {
		boundedId(id);
		const data = parseBookingTransition(input);
		const capability = data.action === "cancel" ? "booking-intent:create" : "booking-intent:manage";
		return this.authorized(context, capability, async (client, actor) => {
			const scope = [context.scope.tenantId, context.scope.storeId];
			const existing = (
				await client.query(
					"SELECT * FROM booking_intents WHERE tenant_id=$1 AND store_id=$2 AND id=$3 FOR UPDATE",
					[...scope, id],
				)
			).rows[0];
			if (!existing) throw new StoreOpsError("not_found");
			if (
				data.action === "cancel" &&
				!(
					context.actor.capabilities.includes("booking-intent:manage") &&
					capabilitiesForRole(actor.role).includes("booking-intent:manage")
				) &&
				(existing.created_by_membership_id !== actor.id || existing.status !== "pending_confirmation")
			)
				throw new StoreOpsError("forbidden");
			if (existing.version !== data.expectedVersion) throw new StoreOpsError("booking_intent_conflict");
			if (existing.preferred_staff_membership_id)
				await scopedStaff(client, context, existing.preferred_staff_membership_id);
			const update = resolveTransition(
				existing.status,
				isoOptional(existing.alternative_start),
				isoOptional(existing.alternative_end),
				data,
			);
			const changed = await client.query(
				`UPDATE booking_intents SET status=$4,alternative_start=$5,alternative_end=$6,confirmed_start=$7,confirmed_end=$8,updated_by_membership_id=$9,version=version+1,updated_at=NOW() WHERE tenant_id=$1 AND store_id=$2 AND id=$3 AND version=$10 AND status=$11 RETURNING *`,
				[
					...scope,
					id,
					update.status,
					update.alternativeStart ?? existing.alternative_start,
					update.alternativeEnd ?? existing.alternative_end,
					update.confirmedStart ?? existing.confirmed_start,
					update.confirmedEnd ?? existing.confirmed_end,
					actor.id,
					data.expectedVersion,
					existing.status,
				],
			);
			if (!changed.rows[0]) throw new StoreOpsError("booking_intent_conflict");
			const creator = (
				await client.query<{ user_id: string }>("SELECT user_id FROM memberships WHERE id=$1", [
					existing.created_by_membership_id,
				])
			).rows[0]!;
			return booking({ ...changed.rows[0], creator_user_id: creator.user_id });
		});
	}

	async listBookingIntents(
		context: SupportExecutionContext,
	): Promise<{ items: BookingIntentDTO[]; truncated: boolean }> {
		return this.authorized(context, "storeops:read", async (client) => {
			const result = await client.query(
				`SELECT b.*,m.user_id AS creator_user_id FROM booking_intents b JOIN memberships m ON m.id=b.created_by_membership_id WHERE b.tenant_id=$1 AND b.store_id=$2 ORDER BY b.created_at DESC,b.id LIMIT 101`,
				[context.scope.tenantId, context.scope.storeId],
			);
			return { items: result.rows.slice(0, 100).map(booking), truncated: result.rows.length > 100 };
		});
	}

	async listNeedsAttention(
		context: SupportExecutionContext,
	): Promise<{ items: NeedsAttentionDTO[]; truncated: boolean }> {
		if (context.actor.role === "agent") throw new StoreOpsError("forbidden");
		return this.authorized(context, "storeops:read", async (client) => {
			const result = await client.query(
				`SELECT c.id AS conversation_id,h.id AS handoff_id,GREATEST(c.updated_at,a.created_at,h.created_at) AS last_activity_at FROM conversations c LEFT JOIN handoffs h ON h.conversation_id=c.id AND h.tenant_id=c.tenant_id AND h.store_id=c.store_id LEFT JOIN LATERAL (SELECT payload->>'outcome' AS outcome,created_at FROM audit_events WHERE conversation_id=c.id AND tenant_id=c.tenant_id AND store_id=c.store_id AND event_type='support-agent.audit' ORDER BY created_at DESC,id DESC LIMIT 1) a ON true WHERE c.tenant_id=$1 AND c.store_id=$2 AND (h.id IS NOT NULL OR a.outcome='fallback') ORDER BY last_activity_at DESC,c.id LIMIT 101`,
				[context.scope.tenantId, context.scope.storeId],
			);
			return {
				items: result.rows.slice(0, 100).map((row) => ({
					conversationId: row.conversation_id,
					basis: row.handoff_id ? "durable_handoff" : "fallback",
					handoffId: row.handoff_id ?? null,
					lastActivityAt: iso(row.last_activity_at),
				})),
				truncated: result.rows.length > 100,
			};
		});
	}
}

async function scopedStaff(client: PoolClient, context: SupportExecutionContext, id: string): Promise<void> {
	const result = await client.query(
		"SELECT id FROM memberships WHERE id=$1 AND tenant_id=$2 AND store_id=$3 FOR SHARE",
		[id, context.scope.tenantId, context.scope.storeId],
	);
	if (!result.rows[0]) throw new StoreOpsError("not_found");
}
function iso(value: unknown): string {
	return (value instanceof Date ? value : new Date(String(value))).toISOString();
}
function isoOptional(value: unknown): string | null {
	return value === null || value === undefined ? null : iso(value);
}
function availability(row: Record<string, unknown>): AvailabilityDTO {
	return {
		id: String(row.id),
		staffMembershipId: String(row.staff_membership_id),
		staffDisplayName: String(row.display_name),
		localDate: row.local_date instanceof Date ? iso(row.local_date).slice(0, 10) : String(row.local_date),
		timeZone: String(row.time_zone),
		windows: row.windows as AvailabilityDTO["windows"],
		status: row.status as AvailabilityDTO["status"],
		source: "human",
		version: Number(row.version),
		updatedAt: iso(row.updated_at),
	};
}
function booking(row: Record<string, unknown>): BookingIntentDTO {
	return {
		id: String(row.id),
		conversationId: String(row.conversation_id),
		customerId: String(row.customer_id),
		requestedService: String(row.requested_service),
		requestedStart: isoOptional(row.requested_start),
		requestedEnd: isoOptional(row.requested_end),
		preferredStaffMembershipId:
			row.preferred_staff_membership_id === null ? null : String(row.preferred_staff_membership_id),
		status: row.status as BookingStatus,
		alternativeStart: isoOptional(row.alternative_start),
		alternativeEnd: isoOptional(row.alternative_end),
		confirmedStart: isoOptional(row.confirmed_start),
		confirmedEnd: isoOptional(row.confirmed_end),
		createdByUserId: String(row.creator_user_id),
		version: Number(row.version),
		createdAt: iso(row.created_at),
		updatedAt: iso(row.updated_at),
	};
}
