import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
	capabilitiesForRole,
	createSupportExecutionContext,
	isRole,
	type SupportExecutionContext,
} from "../../enterprise/identity.ts";
import { boundedId, StoreOpsError } from "../../storeops/contracts.ts";
import { PostgresStoreOpsRepository, StoreOpsService } from "../../storeops/postgres.ts";
import { type WeComKfClient, WeComKfSendRejectedError } from "./client.ts";
import type { StaffApi, StaffConfig, StaffDelivery, StaffEvent } from "./staff-protocol.ts";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const iso = (value: Date | null) => (value ? value.toISOString() : null);
type StaffIdentity = {
	id: string;
	membership_id: string;
	user_id: string;
	tenant_id: string;
	store_id: string;
	role: string;
	created_at: Date;
	external_subject_id: string;
};
function contextFor(row: StaffIdentity): SupportExecutionContext {
	if (!isRole(row.role) || !capabilitiesForRole(row.role).includes("booking-intent:manage"))
		throw new StoreOpsError("forbidden");
	return createSupportExecutionContext(
		{
			id: row.membership_id,
			userId: row.user_id,
			tenantId: row.tenant_id,
			storeId: row.store_id,
			role: row.role,
			createdAt: row.created_at,
		},
		randomUUID(),
	);
}
const staffSelect = `SELECT b.id,b.membership_id,b.external_subject_id,m.user_id,m.tenant_id,m.store_id,m.role,m.created_at
 FROM channel_bindings b JOIN memberships m ON (m.id,m.tenant_id,m.store_id)=(b.membership_id,b.tenant_id,b.store_id)
 WHERE b.corp_id=$1 AND b.application_id=$2 AND b.status='active'
 AND (SELECT COUNT(*) FROM memberships mm WHERE mm.user_id=m.user_id)=1`;

export async function provisionStaffBinding(
	pool: Pool,
	input: { corpId: string; agentId: string; userId: string; membershipId: string },
): Promise<string> {
	for (const value of Object.values(input)) boundedId(value);
	if (!/^[1-9]\d{0,9}$/.test(input.agentId) || input.userId.includes("|") || input.userId === "@all")
		throw new StoreOpsError("invalid_request");
	return new PostgresStoreOpsRepository(pool).transaction(async (client) => {
		const member = (await client.query("SELECT * FROM memberships WHERE id=$1 FOR SHARE", [input.membershipId]))
			.rows[0];
		if (!member) throw new StoreOpsError("not_found");
		const id = randomUUID();
		await client.query(
			`INSERT INTO channel_bindings(id,tenant_id,store_id,corp_id,application_id,external_subject_id,membership_id,status,version,created_at,updated_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,'active',1,NOW(),NOW()) ON CONFLICT(corp_id,application_id,external_subject_id) DO NOTHING`,
			[id, member.tenant_id, member.store_id, input.corpId, input.agentId, input.userId, member.id],
		);
		const existing = (
			await client.query(
				"SELECT * FROM channel_bindings WHERE corp_id=$1 AND application_id=$2 AND external_subject_id=$3 FOR SHARE",
				[input.corpId, input.agentId, input.userId],
			)
		).rows[0];
		if (
			!existing ||
			existing.membership_id !== member.id ||
			existing.tenant_id !== member.tenant_id ||
			existing.store_id !== member.store_id ||
			existing.status !== "active"
		)
			throw new StoreOpsError("forbidden");
		return existing.id;
	});
}

export function staffCustomerText(status: string, confirmedStart: string | null): string {
	if (status === "confirmed" && confirmedStart)
		return `工作人员已确认您的预约意向，确认时间为 ${confirmedStart}。此确认为意向处理结果，不代表容量锁定。`;
	if (status === "cancelled") return "该预约意向已取消，请联系工作人员了解详情。";
	throw new StoreOpsError("invalid_request");
}

/** A bounded Staff application adapter. Business truth stays in StoreOpsService. */
export class WeComStaffService {
	constructor(
		private readonly pool: Pool,
		private readonly config: StaffConfig,
		private readonly api: StaffApi,
		private readonly customerClient?: Pick<WeComKfClient, "sendTextMessage">,
	) {}

	async notify(
		context: SupportExecutionContext,
		bookingId: string,
	): Promise<{ status: StaffDelivery | "unavailable" | "duplicate"; taskId?: string }> {
		boundedId(bookingId);
		const prepared = await new PostgresStoreOpsRepository(this.pool).transaction(async (client) => {
			const actor = (
				await client.query("SELECT * FROM memberships WHERE user_id=$1 FOR SHARE", [context.actor.userId])
			).rows;
			if (
				actor.length !== 1 ||
				actor[0].tenant_id !== context.scope.tenantId ||
				actor[0].store_id !== context.scope.storeId ||
				actor[0].role !== context.actor.role ||
				!isRole(actor[0].role) ||
				!capabilitiesForRole(actor[0].role).includes("booking-intent:create") ||
				!context.actor.capabilities.includes("booking-intent:create")
			)
				throw new StoreOpsError("forbidden");
			const booking = (
				await client.query(
					"SELECT b.*,s.name AS store_name FROM booking_intents b JOIN stores s ON s.id=b.store_id AND s.tenant_id=b.tenant_id WHERE b.id=$1 AND b.tenant_id=$2 AND b.store_id=$3 FOR SHARE OF b",
					[bookingId, context.scope.tenantId, context.scope.storeId],
				)
			).rows[0];
			if (!booking) throw new StoreOpsError("not_found");
			if (booking.status !== "pending_confirmation") return undefined;
			const candidates = (
				await client.query<StaffIdentity>(`${staffSelect} AND m.tenant_id=$3 AND m.store_id=$4 FOR SHARE OF b,m`, [
					this.config.corpId,
					this.config.agentId,
					context.scope.tenantId,
					context.scope.storeId,
				])
			).rows.filter((r) => isRole(r.role) && capabilitiesForRole(r.role).includes("booking-intent:manage"));
			const preferred = candidates.filter((r) => r.membership_id === booking.preferred_staff_membership_id);
			const recipient =
				preferred.length === 1
					? preferred[0]
					: preferred.length === 0 && candidates.length === 1
						? candidates[0]
						: undefined;
			if (!recipient) return undefined;
			const taskId = randomUUID();
			const inserted = await client.query(
				`INSERT INTO wecom_staff_booking_notifications(task_id,booking_id,tenant_id,store_id,corp_id,application_id,binding_id,expected_version,delivery_state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'indeterminate') ON CONFLICT(booking_id,expected_version,corp_id,application_id) DO NOTHING RETURNING task_id`,
				[
					taskId,
					bookingId,
					booking.tenant_id,
					booking.store_id,
					this.config.corpId,
					this.config.agentId,
					recipient.id,
					booking.version,
				],
			);
			if (!inserted.rowCount) return { duplicate: true as const };
			const live = await client.query(
				"SELECT id FROM wecom_customer_bindings WHERE conversation_id=$1 AND tenant_id=$2 AND store_id=$3 AND customer_id=$4",
				[booking.conversation_id, booking.tenant_id, booking.store_id, booking.customer_id],
			);
			return {
				duplicate: false as const,
				taskId,
				input: {
					userId: recipient.external_subject_id,
					taskId,
					storeName: booking.store_name,
					bookingId,
					service: booking.requested_service,
					start: iso(booking.requested_start),
					end: iso(booking.requested_end),
					version: booking.version,
					customerSource: live.rowCount ? "WeChat Customer Service" : "other",
				},
			};
		});
		if (!prepared) return { status: "unavailable" };
		if (prepared.duplicate) return { status: "duplicate" };
		const status = await this.safeDelivery(() => this.api.sendCard(prepared.input));
		await this.pool.query(
			"UPDATE wecom_staff_booking_notifications SET delivery_state=$2,updated_at=NOW() WHERE task_id=$1",
			[prepared.taskId, status],
		);
		return { status, taskId: prepared.taskId };
	}

	async handle(
		event: StaffEvent,
	): Promise<{ status: "confirmed" | "cancelled" | "booking_intent_conflict" | "duplicate" }> {
		if (event.agentId !== this.config.agentId || !["booking_confirm", "booking_cancel"].includes(event.eventKey))
			throw new StoreOpsError("invalid_request");
		for (const value of [event.userId, event.taskId]) boundedId(value);
		const result = await new PostgresStoreOpsRepository(this.pool).transaction(async (client) => {
			// Hold the actual binding and membership through the StoreOps transaction.
			const rows = (
				await client.query<StaffIdentity>(`${staffSelect} AND b.external_subject_id=$3 FOR SHARE OF b,m`, [
					this.config.corpId,
					this.config.agentId,
					event.userId,
				])
			).rows;
			if (rows.length !== 1) throw new StoreOpsError("forbidden");
			const identity = rows[0]!;
			const context = contextFor(identity);
			const task = (
				await client.query(
					`SELECT * FROM wecom_staff_booking_notifications WHERE task_id=$1 AND corp_id=$2 AND application_id=$3 AND tenant_id=$4 AND store_id=$5 AND binding_id=$6 FOR UPDATE`,
					[
						event.taskId,
						this.config.corpId,
						this.config.agentId,
						context.scope.tenantId,
						context.scope.storeId,
						identity.id,
					],
				)
			).rows[0];
			if (!task) throw new StoreOpsError("not_found");
			if (task.delivery_state === "rejected") throw new StoreOpsError("forbidden");
			const payloadHash = hash([event.taskId, event.agentId, event.userId, event.eventKey]);
			const messageId = `staff-booking:${event.taskId}`;
			const inboundId = randomUUID();
			const claim = await client.query(
				`INSERT INTO wecom_inbound_messages(id,corp_id,application_id,message_id,payload_hash,state,binding_id,tenant_id,store_id,request_id,delivery_state,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'processing',$6,$7,$8,$9,'not_sent',NOW(),NOW()) ON CONFLICT(corp_id,application_id,message_id) DO NOTHING RETURNING id`,
				[
					inboundId,
					this.config.corpId,
					this.config.agentId,
					messageId,
					payloadHash,
					identity.id,
					context.scope.tenantId,
					context.scope.storeId,
					context.request.requestId,
				],
			);
			if (!claim.rowCount) {
				const prior = (
					await client.query(
						"SELECT payload_hash FROM wecom_inbound_messages WHERE corp_id=$1 AND application_id=$2 AND message_id=$3",
						[this.config.corpId, this.config.agentId, messageId],
					)
				).rows[0];
				if (prior?.payload_hash !== payloadHash) throw new StoreOpsError("booking_intent_conflict");
				return { status: "duplicate" as const };
			}
			const booking = (
				await client.query(
					"SELECT * FROM booking_intents WHERE id=$1 AND tenant_id=$2 AND store_id=$3 FOR UPDATE",
					[task.booking_id, context.scope.tenantId, context.scope.storeId],
				)
			).rows[0];
			if (!booking) throw new StoreOpsError("not_found");
			let status: "confirmed" | "cancelled" | "booking_intent_conflict";
			if (booking.version !== task.expected_version || booking.status !== "pending_confirmation")
				status = "booking_intent_conflict";
			else {
				const action = event.eventKey === "booking_confirm" ? "confirm" : "cancel";
				if (action === "confirm" && (!booking.requested_start || !booking.requested_end))
					throw new StoreOpsError("invalid_request");
				const service = new StoreOpsService(new PostgresStoreOpsRepository(this.pool, client), () => undefined);
				const changed = await service.transitionBookingIntent(context, booking.id, {
					action,
					expectedVersion: task.expected_version,
					...(action === "confirm"
						? { start: iso(booking.requested_start)!, end: iso(booking.requested_end)! }
						: {}),
				});
				status = changed.status as "confirmed" | "cancelled";
			}
			await client.query(
				"UPDATE wecom_inbound_messages SET state=$2,error_category=$3,updated_at=NOW() WHERE id=$1",
				[
					inboundId,
					status === "booking_intent_conflict" ? "failed" : "completed",
					status === "booking_intent_conflict" ? status : null,
				],
			);
			return { status, version: status === "booking_intent_conflict" ? booking.version : booking.version + 1 };
		});
		if (result.status === "duplicate") return result;
		// ResponseCode is short lived and is used once, in memory only.
		const feedbackText =
			result.status === "booking_intent_conflict"
				? "状态已变化，请重新处理"
				: `${result.status === "confirmed" ? "已确认" : "已取消"} ${result.status} v${result.version}`;
		await this.deliverOnce(event.taskId, "feedback_state", () =>
			this.api.updateCard({ userId: event.userId, responseCode: event.responseCode, text: feedbackText }),
		).catch(() => undefined);
		// Independent postcommit attempts: persistence failure in one cannot suppress the other.
		// A claimed attempt remains indeterminate; callback replay never sends it again.
		if (result.status !== "booking_intent_conflict") await this.notifyCustomer(event.taskId).catch(() => undefined);
		return { status: result.status };
	}

	private async safeDelivery(operation: () => Promise<StaffDelivery>): Promise<StaffDelivery> {
		try {
			return await operation();
		} catch {
			return "indeterminate";
		}
	}
	private async deliverOnce(
		taskId: string,
		column: "feedback_state" | "customer_delivery_state",
		operation: () => Promise<StaffDelivery>,
	): Promise<void> {
		// Column is an internal literal, never external input. Mark before network IO.
		const claimed = await this.pool.query(
			`UPDATE wecom_staff_booking_notifications SET ${column}='indeterminate',updated_at=NOW() WHERE task_id=$1 AND ${column}='not_sent' RETURNING task_id`,
			[taskId],
		);
		if (!claimed.rowCount) return;
		const status = await this.safeDelivery(operation);
		await this.pool.query(
			`UPDATE wecom_staff_booking_notifications SET ${column}=$2,updated_at=NOW() WHERE task_id=$1`,
			[taskId, status],
		);
	}
	private async notifyCustomer(taskId: string): Promise<void> {
		const result = await this.pool.query(
			`SELECT b.status,b.confirmed_start,c.external_userid,k.open_kfid FROM wecom_staff_booking_notifications n
 JOIN booking_intents b ON b.id=n.booking_id AND b.tenant_id=n.tenant_id AND b.store_id=n.store_id
 JOIN wecom_customer_bindings c ON c.conversation_id=b.conversation_id AND c.customer_id=b.customer_id AND c.tenant_id=b.tenant_id AND c.store_id=b.store_id
 JOIN wecom_kf_channels k ON k.id=c.channel_binding_id AND k.tenant_id=c.tenant_id AND k.store_id=c.store_id AND k.status='active' AND k.corp_id=$2
 WHERE n.task_id=$1`,
			[taskId, this.config.corpId],
		);
		if (
			result.rows.length !== 1 ||
			!this.customerClient ||
			!["confirmed", "cancelled"].includes(result.rows[0].status)
		) {
			await this.pool.query(
				"UPDATE wecom_staff_booking_notifications SET customer_delivery_state='unavailable' WHERE task_id=$1 AND customer_delivery_state='not_sent'",
				[taskId],
			);
			return;
		}
		const row = result.rows[0];
		await this.deliverOnce(taskId, "customer_delivery_state", async () => {
			try {
				await this.customerClient!.sendTextMessage({
					openKfId: row.open_kfid,
					externalUserId: row.external_userid,
					messageId: hash(["staff-booking", taskId]).slice(0, 32),
					text: staffCustomerText(row.status, iso(row.confirmed_start)),
				});
				return "accepted";
			} catch (error) {
				return error instanceof WeComKfSendRejectedError ? "rejected" : "indeterminate";
			}
		});
	}
}
