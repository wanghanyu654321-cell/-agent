import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { createSupportExecutionContext, isRole } from "../../enterprise/identity.ts";
import type {
	VerifiedWeComText,
	WeComCompletion,
	WeComConversation,
	WeComRepository,
	WeComResolvedIdentity,
} from "./core.ts";

/** No provisioning or customer mapping: reads only operator-approved existing member bindings. */
export class PostgresWeComRepository implements WeComRepository {
	constructor(private readonly pool: Pool) {}

	async claim(input: {
		message: VerifiedWeComText;
		payloadHash: string;
		requestId: string;
	}): ReturnType<WeComRepository["claim"]> {
		const { message, payloadHash, requestId } = input;
		const inserted = await this.pool.query<{ id: string }>(
			"INSERT INTO wecom_inbound_messages (id,corp_id,application_id,message_id,payload_hash,state,request_id,delivery_state,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,'processing',$6,'not_sent',NOW(),NOW()) ON CONFLICT (corp_id,application_id,message_id) DO NOTHING RETURNING id",
			[randomUUID(), message.corpId, message.applicationId, message.messageId, payloadHash, requestId],
		);
		if (inserted.rows[0]) return { status: "claimed", id: inserted.rows[0].id };
		const existing = await this.pool.query<{ payload_hash: string }>(
			"SELECT payload_hash FROM wecom_inbound_messages WHERE corp_id=$1 AND application_id=$2 AND message_id=$3",
			[message.corpId, message.applicationId, message.messageId],
		);
		if (!existing.rows[0]) throw new Error("dependency_unavailable");
		return { status: existing.rows[0].payload_hash === payloadHash ? "duplicate" : "conflict" };
	}

	async resolveIdentity(message: VerifiedWeComText, requestId: string): Promise<WeComResolvedIdentity | undefined> {
		const result = await this.pool.query<{
			binding_id: string;
			membership_id: string;
			user_id: string;
			tenant_id: string;
			store_id: string;
			role: string;
			created_at: Date;
		}>(
			`SELECT b.id AS binding_id,m.id AS membership_id,m.user_id,m.tenant_id,m.store_id,m.role,m.created_at
			FROM channel_bindings b JOIN memberships m ON (m.id,m.tenant_id,m.store_id)=(b.membership_id,b.tenant_id,b.store_id)
			JOIN users u ON u.id=m.user_id
			WHERE b.corp_id=$1 AND b.application_id=$2 AND b.external_subject_id=$3 AND b.status='active'
			AND (SELECT COUNT(*) FROM memberships all_memberships WHERE all_memberships.user_id=m.user_id)=1`,
			[message.corpId, message.applicationId, message.externalSubjectId],
		);
		const row = result.rows[0];
		if (!row || result.rows.length !== 1 || !isRole(row.role)) return undefined;
		return {
			bindingId: row.binding_id,
			membershipId: row.membership_id,
			context: createSupportExecutionContext(
				{
					id: row.membership_id,
					userId: row.user_id,
					tenantId: row.tenant_id,
					storeId: row.store_id,
					role: row.role,
					createdAt: row.created_at,
				},
				requestId,
			),
		};
	}

	async attachConversation(
		id: string,
		identity: WeComResolvedIdentity,
		conversation: WeComConversation,
	): Promise<boolean> {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN");
			const { tenantId, storeId } = identity.context.scope;
			// Row locking serializes binding/history checks without holding a transaction across Runtime.
			const owned = await client.query(
				"SELECT id FROM conversations WHERE id=$1 AND tenant_id=$2 AND store_id=$3 AND customer_id=$4 FOR UPDATE",
				[conversation.conversationId, tenantId, storeId, conversation.customerId],
			);
			if (owned.rowCount !== 1) {
				await client.query("ROLLBACK");
				return false;
			}
			const conflict = await client.query(
				"SELECT id FROM wecom_inbound_messages WHERE tenant_id=$1 AND store_id=$2 AND conversation_id=$3 AND (state IN ('processing','indeterminate') OR binding_id<>$4) LIMIT 1",
				[tenantId, storeId, conversation.conversationId, identity.bindingId],
			);
			if (conflict.rowCount) {
				await client.query("ROLLBACK");
				return false;
			}
			const updated = await client.query(
				`UPDATE wecom_inbound_messages i SET binding_id=$2,tenant_id=$3,store_id=$4,conversation_id=$5,updated_at=NOW()
				WHERE i.id=$1 AND i.state='processing' AND i.binding_id IS NULL AND EXISTS (
				SELECT 1 FROM channel_bindings b JOIN memberships m ON m.id=b.membership_id
				WHERE b.id=$2 AND b.tenant_id=$3 AND b.store_id=$4 AND b.status='active' AND b.membership_id=$6
				AND m.user_id=$7 AND m.role=$8 AND b.corp_id=i.corp_id AND b.application_id=i.application_id
				AND (SELECT COUNT(*) FROM memberships mm WHERE mm.user_id=m.user_id)=1)`,
				[
					id,
					identity.bindingId,
					tenantId,
					storeId,
					conversation.conversationId,
					identity.membershipId,
					identity.context.actor.userId,
					identity.context.actor.role,
				],
			);
			await client.query("COMMIT");
			return updated.rowCount === 1;
		} catch (error) {
			await client.query("ROLLBACK").catch(() => undefined);
			throw error;
		} finally {
			client.release();
		}
	}

	async markDeliveryUncertain(id: string): Promise<void> {
		const result = await this.pool.query(
			"UPDATE wecom_inbound_messages SET delivery_state='indeterminate',updated_at=NOW() WHERE id=$1 AND state='processing' AND delivery_state='not_sent' AND conversation_id IS NOT NULL",
			[id],
		);
		if (result.rowCount !== 1) throw new Error("dependency_unavailable");
	}

	async finish(id: string, completion: WeComCompletion): Promise<void> {
		const result = await this.pool.query(
			"UPDATE wecom_inbound_messages SET state=$2,delivery_state=$3,result_type=$4,error_category=$5,updated_at=NOW() WHERE id=$1 AND state='processing'",
			[
				id,
				completion.state,
				completion.deliveryState,
				completion.resultType ?? null,
				completion.errorCategory ?? null,
			],
		);
		if (result.rowCount !== 1) throw new Error("dependency_unavailable");
	}
}
