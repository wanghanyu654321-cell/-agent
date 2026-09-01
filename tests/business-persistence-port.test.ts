import { fauxAssistantMessage, registerFauxProvider, streamSimple } from "@earendil-works/pi-ai/compat";
import { afterEach, describe, expect, it } from "vitest";
import {
	InMemoryRetrievalService,
	InMemorySupportStore,
	SupportAgentRuntime,
	type SupportBusinessStore,
} from "../src/index.ts";

const registrations: Array<{ unregister(): void }> = [];

afterEach(() => {
	while (registrations.length > 0) registrations.pop()?.unregister();
});

describe("SupportAgentRuntime persistent business port", () => {
	it("awaits durable ticket creation and records the existing structured audit payload", async () => {
		const faux = registerFauxProvider();
		registrations.push(faux);
		faux.setResponses([
			fauxAssistantMessage(
				[
					{
						type: "toolCall",
						id: "ticket-1",
						name: "create_ticket",
						arguments: { summary: "顾客要求退款", idempotencyKey: "ticket-key" },
					},
				],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("已记录您的工单。"),
		]);
		const durable = new CapturingBusinessStore();
		const runtime = new SupportAgentRuntime({
			model: faux.getModel(),
			streamFn: streamSimple,
			retrieval: new InMemoryRetrievalService(),
			store: new InMemorySupportStore(),
			businessStore: durable,
			faq: [],
		});

		const result = await runtime.run({
			conversationId: "conversation-a",
			tenantId: "tenant-a",
			storeId: "store-a",
			customerId: "customer-a",
			text: "请帮我创建退款工单",
			permissions: ["tickets:write"],
		});

		expect(result.type).toBe("answer");
		expect(durable.tickets).toEqual([
			expect.objectContaining({
				tenantId: "tenant-a",
				storeId: "store-a",
				conversationId: "conversation-a",
				idempotencyKey: "ticket-key",
			}),
		]);
		expect(durable.audits).toHaveLength(1);
		expect(durable.audits[0]).toMatchObject({
			tenantId: "tenant-a",
			storeId: "store-a",
			conversationId: "conversation-a",
			eventType: "support-agent.audit",
			payload: expect.objectContaining({ outcome: "answer", toolsCalled: ["create_ticket"] }),
		});
	});

	it("persists the qualified-human safety handoff without ordinary handoff permission", async () => {
		const faux = registerFauxProvider();
		registrations.push(faux);
		faux.setResponses([fauxAssistantMessage("请继续操作。")]);
		const durable = new CapturingBusinessStore();
		const runtime = new SupportAgentRuntime({
			model: faux.getModel(),
			streamFn: streamSimple,
			retrieval: new InMemoryRetrievalService(),
			store: new InMemorySupportStore(),
			businessStore: durable,
			faq: [],
		});

		const result = await runtime.run({
			conversationId: "conversation-safety",
			tenantId: "tenant-a",
			storeId: "store-a",
			customerId: "customer-a",
			text: "顾客操作中皮肤越来越痒，应该怎么继续？",
			permissions: ["tickets:write"],
			mayEscalate: false,
		});

		expect(result.type).toBe("escalation");
		expect(durable.handoffs).toEqual([
			expect.objectContaining({
				tenantId: "tenant-a",
				storeId: "store-a",
				conversationId: "conversation-safety",
				reason: expect.stringContaining("qualified_professional_required"),
			}),
		]);
	});
});

class CapturingBusinessStore implements SupportBusinessStore {
	readonly tickets: Array<{
		id: string;
		tenantId: string;
		storeId: string;
		conversationId: string;
		summary: string;
		idempotencyKey: string;
		createdAt: Date;
	}> = [];
	readonly handoffs: Array<{
		id: string;
		tenantId: string;
		storeId: string;
		conversationId: string;
		reason: string;
		createdAt: Date;
	}> = [];
	readonly audits: Array<{
		tenantId: string;
		storeId: string;
		conversationId: string;
		eventType: "support-agent.audit";
		payload: Record<string, unknown>;
	}> = [];

	async findTicket(tenantId: string, idempotencyKey: string) {
		return this.tickets.find((ticket) => ticket.tenantId === tenantId && ticket.idempotencyKey === idempotencyKey);
	}

	async createTicket(input: Omit<(typeof this.tickets)[number], "id" | "createdAt">) {
		const existing = await this.findTicket(input.tenantId, input.idempotencyKey);
		if (existing) return { ticket: existing, duplicate: true };
		const ticket = { ...input, id: `durable-ticket-${this.tickets.length + 1}`, createdAt: new Date() };
		this.tickets.push(ticket);
		return { ticket, duplicate: false };
	}

	async findHandoff(tenantId: string, storeId: string, conversationId: string) {
		return this.handoffs.find(
			(handoff) =>
				handoff.tenantId === tenantId && handoff.storeId === storeId && handoff.conversationId === conversationId,
		);
	}

	async createHandoff(input: Omit<(typeof this.handoffs)[number], "id" | "createdAt">) {
		const existing = await this.findHandoff(input.tenantId, input.storeId, input.conversationId);
		if (existing) return { handoff: existing, duplicate: true };
		const handoff = { ...input, id: `durable-handoff-${this.handoffs.length + 1}`, createdAt: new Date() };
		this.handoffs.push(handoff);
		return { handoff, duplicate: false };
	}

	async recordAudit(input: (typeof this.audits)[number]) {
		this.audits.push(structuredClone(input));
	}
}
