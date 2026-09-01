import type { SupportRuntimePort } from "../http-api.ts";
import type {
	PersistentSupportHandoff,
	PersistentSupportTicket,
	SupportBusinessAuditRecord,
	SupportBusinessStore,
	SupportRequest,
	SupportResult,
} from "../index.ts";
import type { Capability, SupportExecutionContext } from "./identity.ts";

export interface EnterpriseScope {
	tenantId: string;
	storeId: string;
}

export interface ConversationRecord extends EnterpriseScope {
	id: string;
	customerId: string;
	piSessionId?: string;
	createdAt: Date;
	updatedAt: Date;
}

export type PersistentTicketRecord = PersistentSupportTicket;
export type PersistentHandoffRecord = PersistentSupportHandoff;
export interface PersistentAuditEventRecord extends SupportBusinessAuditRecord {
	id: string;
	createdAt: Date;
}

export interface EnterpriseBusinessRepository extends SupportBusinessStore {
	findConversationById(conversationId: string): Promise<ConversationRecord | undefined>;
	createConversation(conversation: ConversationRecord): Promise<ConversationRecord>;
	setConversationPiSession(conversationId: string, piSessionId: string, updatedAt: Date): Promise<void>;
	listConversations(tenantId: string, storeId: string): Promise<ConversationRecord[]>;
	listTickets(tenantId: string, storeId: string): Promise<PersistentTicketRecord[]>;
	listHandoffs(tenantId: string, storeId: string): Promise<PersistentHandoffRecord[]>;
	listAuditEvents(tenantId: string, storeId: string): Promise<PersistentAuditEventRecord[]>;
}

export interface EnterpriseSupportServiceOptions {
	repository: EnterpriseBusinessRepository;
	runtime: SupportRuntimePort;
	now?: () => Date;
}

export interface EnterpriseSupportPort {
	respond(
		context: SupportExecutionContext,
		input: Pick<SupportRequest, "conversationId" | "customerId" | "text">,
	): Promise<SupportResult>;
	listConversations(context: SupportExecutionContext): Promise<ConversationRecord[]>;
	listTickets(context: SupportExecutionContext): Promise<PersistentTicketRecord[]>;
	listHandoffs(context: SupportExecutionContext): Promise<PersistentHandoffRecord[]>;
	listAuditEvents(context: SupportExecutionContext): Promise<PersistentAuditEventRecord[]>;
}

export class EnterpriseConversationNotFoundError extends Error {}
export class EnterpriseConversationConflictError extends Error {}

export class EnterpriseSupportService implements EnterpriseSupportPort {
	private readonly repository: EnterpriseBusinessRepository;
	private readonly runtime: SupportRuntimePort;
	private readonly now: () => Date;

	constructor(options: EnterpriseSupportServiceOptions) {
		this.repository = options.repository;
		this.runtime = options.runtime;
		this.now = options.now ?? (() => new Date());
	}

	async respond(
		context: SupportExecutionContext,
		input: Pick<SupportRequest, "conversationId" | "customerId" | "text">,
	): Promise<SupportResult> {
		await this.resolveConversation(context.scope, input.conversationId, input.customerId);
		const result = await this.runtime.run(runtimeRequest(input, context));
		await this.repository.setConversationPiSession(input.conversationId, result.piSessionId, this.now());
		return result;
	}

	async listConversations(context: SupportExecutionContext): Promise<ConversationRecord[]> {
		return this.repository.listConversations(context.scope.tenantId, context.scope.storeId);
	}

	async listTickets(context: SupportExecutionContext): Promise<PersistentTicketRecord[]> {
		return this.repository.listTickets(context.scope.tenantId, context.scope.storeId);
	}

	async listHandoffs(context: SupportExecutionContext): Promise<PersistentHandoffRecord[]> {
		return this.repository.listHandoffs(context.scope.tenantId, context.scope.storeId);
	}

	async listAuditEvents(context: SupportExecutionContext): Promise<PersistentAuditEventRecord[]> {
		return this.repository.listAuditEvents(context.scope.tenantId, context.scope.storeId);
	}

	private async resolveConversation(
		scope: EnterpriseScope,
		conversationId: string,
		customerId: string,
	): Promise<ConversationRecord> {
		const existing = await this.repository.findConversationById(conversationId);
		if (!existing) {
			const now = this.now();
			return this.repository.createConversation({
				...scope,
				id: conversationId,
				customerId,
				createdAt: now,
				updatedAt: now,
			});
		}
		if (existing.tenantId !== scope.tenantId || existing.storeId !== scope.storeId) {
			throw new EnterpriseConversationNotFoundError("Conversation not found.");
		}
		if (existing.customerId !== customerId) {
			throw new EnterpriseConversationConflictError("Conversation customer binding does not match.");
		}
		return existing;
	}
}

export function runtimeRequest(
	input: Pick<SupportRequest, "conversationId" | "customerId" | "text">,
	context: SupportExecutionContext,
): SupportRequest {
	const capabilities = new Set<Capability>(context.actor.capabilities);
	return {
		conversationId: input.conversationId,
		customerId: input.customerId,
		text: input.text,
		tenantId: context.scope.tenantId,
		storeId: context.scope.storeId,
		permissions: [
			...(capabilities.has("ticket:create") ? ["tickets:write"] : []),
			...(capabilities.has("handoff:create") ? ["handoff:write"] : []),
		],
		mayEscalate: capabilities.has("handoff:create"),
	};
}
