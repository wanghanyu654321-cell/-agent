import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { createSupportExecutionContext, isRole, type SupportExecutionContext } from "../../enterprise/identity.ts";

export interface VerifiedWeComCustomerText {
	corpId: string;
	openKfId: string;
	externalUserId: string;
	messageId: string;
	sentAtUnix: number;
	text: string;
}

export interface WeComCustomerRoute {
	channelBindingId: string;
	customerBindingId: string;
	customerId: string;
	conversationId: string;
	context: SupportExecutionContext;
}

export type WeComCustomerClaim = { status: "claimed"; id: string } | { status: "duplicate" } | { status: "conflict" };

export function weComCustomerPayloadHash(message: VerifiedWeComCustomerText): string {
	return createHash("sha256")
		.update(
			JSON.stringify([
				message.corpId,
				message.openKfId,
				message.externalUserId,
				message.messageId,
				message.sentAtUnix,
				message.text,
			]),
		)
		.digest("hex");
}

export class PostgresWeComCustomerRepository {
	constructor(private readonly pool: Pool) {}

	async claim(message: VerifiedWeComCustomerText, requestId: string): Promise<WeComCustomerClaim> {
		const payloadHash = weComCustomerPayloadHash(message);
		const inserted = await this.pool.query<{ id: string }>(
			"INSERT INTO wecom_customer_inbound_messages (id,corp_id,open_kfid,message_id,payload_hash,state,request_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,'processing',$6,NOW(),NOW()) ON CONFLICT (corp_id,open_kfid,message_id) DO NOTHING RETURNING id",
			[randomUUID(), message.corpId, message.openKfId, message.messageId, payloadHash, requestId],
		);
		if (inserted.rows[0]) return { status: "claimed", id: inserted.rows[0].id };
		const existing = await this.pool.query<{ payload_hash: string }>(
			"SELECT payload_hash FROM wecom_customer_inbound_messages WHERE corp_id=$1 AND open_kfid=$2 AND message_id=$3",
			[message.corpId, message.openKfId, message.messageId],
		);
		if (!existing.rows[0]) throw new Error("dependency_unavailable");
		return { status: existing.rows[0].payload_hash === payloadHash ? "duplicate" : "conflict" };
	}

	async resolveRoute(message: VerifiedWeComCustomerText, requestId: string): Promise<WeComCustomerRoute | undefined> {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN");
			const authority = await this.lockAuthority(client, message);
			if (!authority || !isRole(authority.role)) {
				await client.query("ROLLBACK");
				return undefined;
			}
			const context = createSupportExecutionContext(
				{
					id: authority.authority_membership_id,
					userId: authority.user_id,
					tenantId: authority.tenant_id,
					storeId: authority.store_id,
					role: authority.role,
					createdAt: authority.membership_created_at,
				},
				requestId,
			);
			if (!context.actor.capabilities.includes("agent:invoke")) {
				await client.query("ROLLBACK");
				return undefined;
			}

			const existing = await client.query<{
				id: string;
				customer_id: string;
				conversation_id: string;
			}>(
				"SELECT id,customer_id,conversation_id FROM wecom_customer_bindings WHERE channel_binding_id=$1 AND external_userid=$2",
				[authority.channel_binding_id, message.externalUserId],
			);
			if (existing.rows[0]) {
				await client.query("COMMIT");
				return {
					channelBindingId: authority.channel_binding_id,
					customerBindingId: existing.rows[0].id,
					customerId: existing.rows[0].customer_id,
					conversationId: existing.rows[0].conversation_id,
					context,
				};
			}

			const customerBindingId = `wecom-customer-binding-${randomUUID()}`;
			const customerId = `wecom-customer-${randomUUID()}`;
			const conversationId = `wecom-conversation-${randomUUID()}`;
			await client.query(
				"INSERT INTO conversations (id,tenant_id,store_id,customer_id,created_at,updated_at) VALUES ($1,$2,$3,$4,NOW(),NOW())",
				[conversationId, authority.tenant_id, authority.store_id, customerId],
			);
			await client.query(
				"INSERT INTO wecom_customer_bindings (id,channel_binding_id,tenant_id,store_id,external_userid,customer_id,conversation_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())",
				[
					customerBindingId,
					authority.channel_binding_id,
					authority.tenant_id,
					authority.store_id,
					message.externalUserId,
					customerId,
					conversationId,
				],
			);
			await client.query("COMMIT");
			return {
				channelBindingId: authority.channel_binding_id,
				customerBindingId,
				customerId,
				conversationId,
				context,
			};
		} catch (error) {
			await client.query("ROLLBACK").catch(() => undefined);
			throw error;
		} finally {
			client.release();
		}
	}

	async attachRoute(claimId: string, route: WeComCustomerRoute): Promise<boolean> {
		const result = await this.pool.query(
			`UPDATE wecom_customer_inbound_messages
			SET state='routed',channel_binding_id=$2,customer_binding_id=$3,tenant_id=$4,store_id=$5,conversation_id=$6,updated_at=NOW()
			WHERE id=$1 AND state='processing' AND channel_binding_id IS NULL`,
			[
				claimId,
				route.channelBindingId,
				route.customerBindingId,
				route.context.scope.tenantId,
				route.context.scope.storeId,
				route.conversationId,
			],
		);
		return result.rowCount === 1;
	}

	private async lockAuthority(
		client: PoolClient,
		message: Pick<VerifiedWeComCustomerText, "corpId" | "openKfId">,
	): Promise<
		| {
				channel_binding_id: string;
				authority_membership_id: string;
				user_id: string;
				tenant_id: string;
				store_id: string;
				role: string;
				membership_created_at: Date;
		  }
		| undefined
	> {
		const result = await client.query<{
			channel_binding_id: string;
			authority_membership_id: string;
			user_id: string;
			tenant_id: string;
			store_id: string;
			role: string;
			membership_created_at: Date;
		}>(
			`SELECT c.id AS channel_binding_id,c.authority_membership_id,m.user_id,c.tenant_id,c.store_id,m.role,
			m.created_at AS membership_created_at
			FROM wecom_kf_channels c
			JOIN memberships m ON (m.id,m.tenant_id,m.store_id)=(c.authority_membership_id,c.tenant_id,c.store_id)
			WHERE c.corp_id=$1 AND c.open_kfid=$2 AND c.status='active'
			FOR UPDATE OF c`,
			[message.corpId, message.openKfId],
		);
		return result.rows.length === 1 ? result.rows[0] : undefined;
	}
}
