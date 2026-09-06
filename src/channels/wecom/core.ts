import { createHash, randomUUID } from "node:crypto";
import type { SupportExecutionContext } from "../../enterprise/identity.ts";
import type { SupportResult } from "../../index.ts";

/** Internal normalized input only. GAP-01/02 block wire verification and live customer mapping. */
export interface VerifiedWeComText {
	corpId: string;
	applicationId: string;
	externalSubjectId: string;
	messageId: string;
	sentAt: string;
	text: string;
}

export interface WeComResolvedIdentity {
	bindingId: string;
	membershipId: string;
	context: SupportExecutionContext;
}

export interface WeComConversation {
	conversationId: string;
	customerId: string;
}

export type WeComErrorCategory =
	| "invalid_request"
	| "payload_conflict"
	| "identity_unresolved"
	| "conversation_busy"
	| "dispatch_unavailable"
	| "delivery_unavailable"
	| "dependency_unavailable";

export interface WeComCompletion {
	state: "completed" | "failed" | "indeterminate";
	deliveryState: "not_sent" | "sent" | "indeterminate";
	resultType?: SupportResult["type"];
	errorCategory?: WeComErrorCategory;
}

export interface WeComRepository {
	claim(input: {
		message: VerifiedWeComText;
		payloadHash: string;
		requestId: string;
	}): Promise<{ status: "claimed"; id: string } | { status: "duplicate" } | { status: "conflict" }>;
	resolveIdentity(message: VerifiedWeComText, requestId: string): Promise<WeComResolvedIdentity | undefined>;
	attachConversation(id: string, identity: WeComResolvedIdentity, conversation: WeComConversation): Promise<boolean>;
	markDeliveryUncertain(id: string): Promise<void>;
	finish(id: string, completion: WeComCompletion): Promise<void>;
}

export interface WeComOutbound {
	send(input: {
		requestId: string;
		bindingId: string;
		conversationId: string;
		publicResult: Omit<SupportResult, "sessionEvents">;
	}): Promise<void>;
}

export interface WeComCoreOptions {
	repository: WeComRepository;
	receiver: Pick<VerifiedWeComText, "corpId" | "applicationId">;
	/** Trusted Node mapping fixture/approved mapping only; never callback-supplied conversation scope. */
	resolveConversation(identity: WeComResolvedIdentity): Promise<WeComConversation>;
	respond(context: SupportExecutionContext, input: WeComConversation & { text: string }): Promise<SupportResult>;
	/** No implementation of a live sender is provided while GAP-01/02 remain unresolved. */
	outbound: WeComOutbound;
}

export type WeComOutcome =
	| { status: "completed"; resultType: SupportResult["type"] }
	| { status: "duplicate"; category: "duplicate_event" }
	| { status: "blocked"; category: WeComErrorCategory };

export function parseVerifiedWeComText(
	value: unknown,
	receiver: Pick<VerifiedWeComText, "corpId" | "applicationId">,
): VerifiedWeComText {
	const keys = ["corpId", "applicationId", "externalSubjectId", "messageId", "sentAt", "text"];
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_request");
	const input = value as Record<string, unknown>;
	if (Object.keys(input).length !== keys.length || Object.keys(input).some((key) => !keys.includes(key)))
		throw new Error("invalid_request");
	for (const key of keys) {
		const field = input[key];
		if (
			typeof field !== "string" ||
			!field.trim() ||
			!field.isWellFormed() ||
			field.includes("\0") ||
			[...field].length > (key === "text" ? 4000 : 200)
		)
			throw new Error("invalid_request");
	}
	const message = input as unknown as VerifiedWeComText;
	if (message.corpId !== receiver.corpId || message.applicationId !== receiver.applicationId)
		throw new Error("invalid_request");
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(message.sentAt)) throw new Error("invalid_request");
	const instant = new Date(message.sentAt);
	if (
		!Number.isFinite(instant.getTime()) ||
		instant.toISOString() !== message.sentAt.replace(/(?<=:\d{2})Z$/, ".000Z")
	)
		throw new Error("invalid_request");
	return {
		corpId: message.corpId,
		applicationId: message.applicationId,
		externalSubjectId: message.externalSubjectId,
		messageId: message.messageId,
		sentAt: message.sentAt,
		text: message.text,
	};
}

export function weComPayloadHash(message: VerifiedWeComText): string {
	return createHash("sha256")
		.update(
			JSON.stringify([
				message.corpId,
				message.applicationId,
				message.externalSubjectId,
				message.messageId,
				message.sentAt,
				message.text,
			]),
		)
		.digest("hex");
}

function sameIdentity(left: WeComResolvedIdentity, right: WeComResolvedIdentity | undefined): boolean {
	return (
		right !== undefined &&
		left.bindingId === right.bindingId &&
		left.membershipId === right.membershipId &&
		left.context.actor.userId === right.context.actor.userId &&
		left.context.actor.role === right.context.actor.role &&
		left.context.scope.tenantId === right.context.scope.tenantId &&
		left.context.scope.storeId === right.context.scope.storeId &&
		JSON.stringify(left.context.actor.capabilities) === JSON.stringify(right.context.actor.capabilities)
	);
}

export class WeComCore {
	constructor(private readonly options: WeComCoreOptions) {}

	async handle(input: unknown): Promise<WeComOutcome> {
		let message: VerifiedWeComText;
		try {
			message = parseVerifiedWeComText(input, this.options.receiver);
		} catch {
			return { status: "blocked", category: "invalid_request" };
		}
		const repository = this.options.repository;
		const requestId = randomUUID();
		let claimId: string | undefined;
		let dispatched = false;
		let deliveryUncertain = false;
		let resultType: SupportResult["type"] | undefined;
		let category: WeComErrorCategory = "dependency_unavailable";
		try {
			const claim = await repository.claim({ message, payloadHash: weComPayloadHash(message), requestId });
			if (claim.status === "duplicate") return { status: "duplicate", category: "duplicate_event" };
			if (claim.status === "conflict") return { status: "blocked", category: "payload_conflict" };
			claimId = claim.id;
			const identity = await repository.resolveIdentity(message, requestId);
			if (!identity || !identity.context.actor.capabilities.includes("agent:invoke")) {
				category = "identity_unresolved";
				throw new Error(category);
			}
			const conversation = await this.options.resolveConversation(identity);
			if (
				Object.keys(conversation).length !== 2 ||
				![conversation.conversationId, conversation.customerId].every(
					(value) => typeof value === "string" && value.trim() && value.length <= 200,
				)
			) {
				category = "identity_unresolved";
				throw new Error(category);
			}
			if (!sameIdentity(identity, await repository.resolveIdentity(message, requestId))) {
				category = "identity_unresolved";
				throw new Error(category);
			}
			if (!(await repository.attachConversation(claimId, identity, conversation))) {
				category = "conversation_busy";
				throw new Error(category);
			}
			category = "dispatch_unavailable";
			dispatched = true;
			const result = await this.options.respond(identity.context, { ...conversation, text: message.text });
			resultType = result.type;
			category = "dependency_unavailable";
			if (!sameIdentity(identity, await repository.resolveIdentity(message, requestId))) {
				category = "identity_unresolved";
				throw new Error(category);
			}
			// Commit uncertainty before the external boundary: a lost acknowledgement cannot justify replay.
			deliveryUncertain = true;
			await repository.markDeliveryUncertain(claimId);
			category = "delivery_unavailable";
			await this.options.outbound.send({
				requestId,
				bindingId: identity.bindingId,
				conversationId: conversation.conversationId,
				publicResult: {
					type: result.type,
					text: result.text,
					piSessionId: result.piSessionId,
					toolsCalled: [...result.toolsCalled],
					evidence: result.evidence.map((item) => ({
						id: item.id,
						kind: item.kind,
						version: item.version,
						sourceRef: item.sourceRef,
					})),
				},
			});
			category = "dependency_unavailable";
			await repository.finish(claimId, { state: "completed", deliveryState: "sent", resultType: result.type });
			return { status: "completed", resultType: result.type };
		} catch {
			if (claimId) {
				await repository
					.finish(claimId, {
						state: dispatched ? "indeterminate" : "failed",
						deliveryState: deliveryUncertain ? "indeterminate" : "not_sent",
						resultType,
						errorCategory: category,
					})
					.catch(() => undefined);
			}
			return { status: "blocked", category };
		}
	}
}
