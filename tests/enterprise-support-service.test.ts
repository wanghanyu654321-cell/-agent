import { describe, expect, it } from "vitest";
import {
	type EnterpriseBusinessRepository,
	EnterpriseConversationConflictError,
	EnterpriseConversationNotFoundError,
	EnterpriseSupportService,
} from "../src/enterprise/business.ts";
import { createSupportExecutionContext, type Membership, type Role } from "../src/enterprise/identity.ts";
import type { SupportRuntimePort } from "../src/http-api.ts";
import type { SupportRequest, SupportResult } from "../src/index.ts";

const createdAt = new Date("2026-09-01T00:00:00.000Z");

function context(tenantId = "tenant-a", storeId = "store-a", role: Role = "agent") {
	const membership: Membership = {
		id: `membership-${tenantId}`,
		userId: "user-a",
		tenantId,
		storeId,
		role,
		createdAt,
	};
	return createSupportExecutionContext(membership, "request-1");
}

function result(): SupportResult {
	return {
		type: "answer",
		text: "已根据证据答复。",
		piSessionId: "pi-session-1",
		toolsCalled: [],
		sessionEvents: [],
		evidence: [],
	};
}

class FakeBusinessRepository implements EnterpriseBusinessRepository {
	readonly conversations = new Map<
		string,
		{
			id: string;
			tenantId: string;
			storeId: string;
			customerId: string;
			piSessionId?: string;
			createdAt: Date;
			updatedAt: Date;
		}
	>();

	async findConversationById(conversationId: string) {
		const conversation = this.conversations.get(conversationId);
		return conversation ? { ...conversation } : undefined;
	}

	async createConversation(conversation: {
		id: string;
		tenantId: string;
		storeId: string;
		customerId: string;
		createdAt: Date;
		updatedAt: Date;
	}) {
		this.conversations.set(conversation.id, { ...conversation });
		return { ...conversation };
	}

	async setConversationPiSession(conversationId: string, piSessionId: string, updatedAt: Date) {
		const conversation = this.conversations.get(conversationId);
		if (!conversation) throw new Error("Conversation not found.");
		this.conversations.set(conversationId, { ...conversation, piSessionId, updatedAt });
	}

	async listConversations(tenantId: string, storeId: string) {
		return [...this.conversations.values()]
			.filter((conversation) => conversation.tenantId === tenantId && conversation.storeId === storeId)
			.map((conversation) => ({ ...conversation }));
	}

	async findTicket() {
		return undefined;
	}

	async createTicket(_input: Parameters<EnterpriseBusinessRepository["createTicket"]>[0]): Promise<never> {
		throw new Error("Not used by this service test.");
	}

	async findHandoff(_tenantId: string, _storeId: string, _conversationId: string) {
		return undefined;
	}

	async createHandoff(_input: Parameters<EnterpriseBusinessRepository["createHandoff"]>[0]): Promise<never> {
		throw new Error("Not used by this service test.");
	}

	async recordAudit() {}

	async listTickets() {
		return [];
	}

	async listHandoffs() {
		return [];
	}

	async listAuditEvents() {
		return [];
	}
}

describe("EnterpriseSupportService", () => {
	it("persists a new conversation in the authenticated tenant/store before invoking Runtime", async () => {
		const repository = new FakeBusinessRepository();
		const requests: SupportRequest[] = [];
		const runtime: SupportRuntimePort = {
			async run(request) {
				requests.push(structuredClone(request));
				return result();
			},
		};
		const service = new EnterpriseSupportService({ repository, runtime, now: () => createdAt });

		const response = await service.respond(context(), {
			conversationId: "conversation-a",
			customerId: "customer-a",
			text: "请问营业时间？",
		});

		expect(response.piSessionId).toBe("pi-session-1");
		expect(await repository.findConversationById("conversation-a")).toMatchObject({
			tenantId: "tenant-a",
			storeId: "store-a",
			customerId: "customer-a",
			piSessionId: "pi-session-1",
		});
		expect(requests).toEqual([
			{
				conversationId: "conversation-a",
				customerId: "customer-a",
				text: "请问营业时间？",
				tenantId: "tenant-a",
				storeId: "store-a",
				permissions: ["tickets:write"],
				mayEscalate: false,
			},
		]);
	});

	it("fails closed for a cross-scope conversation and rejects same-scope customer rebinding", async () => {
		const repository = new FakeBusinessRepository();
		await repository.createConversation({
			id: "conversation-a",
			tenantId: "tenant-a",
			storeId: "store-a",
			customerId: "customer-a",
			createdAt,
			updatedAt: createdAt,
		});
		const runtime: SupportRuntimePort = {
			async run() {
				return result();
			},
		};
		const service = new EnterpriseSupportService({ repository, runtime, now: () => createdAt });

		await expect(
			service.respond(context("tenant-b", "store-b"), {
				conversationId: "conversation-a",
				customerId: "customer-a",
				text: "继续处理",
			}),
		).rejects.toBeInstanceOf(EnterpriseConversationNotFoundError);
		await expect(
			service.respond(context(), {
				conversationId: "conversation-a",
				customerId: "customer-other",
				text: "继续处理",
			}),
		).rejects.toBeInstanceOf(EnterpriseConversationConflictError);
	});

	it("rejects audit-event reads without the existing audit:read capability", async () => {
		const repository = new FakeBusinessRepository();
		const service = new EnterpriseSupportService({
			repository,
			runtime: {
				async run() {
					return result();
				},
			},
		});

		await expect(service.listAuditEvents(context())).rejects.toThrow("Audit read permission denied.");
		await expect(service.listAuditEvents(context("tenant-a", "store-a", "admin"))).resolves.toEqual([]);
	});
});
