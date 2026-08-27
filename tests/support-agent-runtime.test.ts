import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import {
	type AssistantMessage,
	type AssistantMessageEvent,
	EventStream,
	fauxAssistantMessage,
	registerFauxProvider,
	streamSimple,
} from "@earendil-works/pi-ai/compat";
import { type CustomEntry, SessionManager } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import {
	InMemoryRetrievalService,
	InMemorySupportStore,
	type RetrievalService,
	SupportAgentRuntime,
} from "../src/index.ts";

const registrations: Array<{ unregister(): void }> = [];

afterEach(() => {
	while (registrations.length > 0) registrations.pop()?.unregister();
});

describe("SupportAgentRuntime", () => {
	function createRuntime(
		responses: Parameters<ReturnType<typeof registerFauxProvider>["setResponses"]>[0],
		options?: {
			retrieval?: RetrievalService;
			store?: InMemorySupportStore;
			limits?: {
				maxAgentTurns?: number;
				maxToolCalls?: number;
				overallTurnTimeoutMs?: number;
				perToolTimeoutMs?: number;
			};
		},
	) {
		const faux = registerFauxProvider();
		registrations.push(faux);
		faux.setResponses(responses);
		return new SupportAgentRuntime({
			model: faux.getModel(),
			streamFn: streamSimple,
			retrieval: options?.retrieval ?? new InMemoryRetrievalService(),
			store: options?.store ?? new InMemorySupportStore(),
			faq: [{ question: "营业时间", answer: "门店每天 09:00-21:00 营业。" }],
			limits: options?.limits,
		});
	}

	function request(overrides: Partial<Parameters<SupportAgentRuntime["run"]>[0]> = {}) {
		return {
			conversationId: "conversation-1",
			tenantId: "tenant-a",
			storeId: "store-a",
			customerId: "customer-a",
			text: "请问营业时间？",
			...overrides,
		};
	}

	it("answers a direct FAQ through the Pi agent and persists its session events", async () => {
		const faux = registerFauxProvider();
		registrations.push(faux);
		faux.setResponses([
			fauxAssistantMessage(
				[{ type: "toolCall", id: "faq-1", name: "search_faq", arguments: { query: "营业时间" } }],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("门店每天 09:00-21:00 营业。"),
		]);

		const runtime = new SupportAgentRuntime({
			model: faux.getModel(),
			streamFn: streamSimple,
			retrieval: new InMemoryRetrievalService(),
			store: new InMemorySupportStore(),
			faq: [{ question: "营业时间", answer: "门店每天 09:00-21:00 营业。" }],
		});

		const result = await runtime.run({
			conversationId: "conversation-1",
			tenantId: "tenant-a",
			storeId: "store-a",
			customerId: "customer-a",
			text: "请问营业时间？",
		});

		expect(result.type).toBe("answer");
		expect(result.text).toBe("门店每天 09:00-21:00 营业。");
		expect(result.toolsCalled).toEqual(["search_faq"]);
		expect(result.sessionEvents.some((event) => event.type === "tool_execution_end")).toBe(true);
		expect(runtime.getMappedSessionId("conversation-1")).toBe(result.piSessionId);
	});

	it("returns a fallback when a FAQ miss is followed by an unsupported factual answer", async () => {
		const runtime = createRuntime([
			fauxAssistantMessage(
				[{ type: "toolCall", id: "faq-miss", name: "search_faq", arguments: { query: "退款到账" } }],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("退款会在一个工作日内到账。"),
		]);

		const result = await runtime.run(request({ text: "退款多久到账？" }));

		expect(result.type).toBe("fallback");
		expect(result.toolsCalled).toEqual(["search_faq"]);
		expect(result.sessionEvents.some((event) => event.type === "tool_execution_end" && !event.isError)).toBe(true);
	});

	it("returns a fallback when a factual support claim has no verified tool evidence", async () => {
		const runtime = createRuntime([fauxAssistantMessage("退款会在一个工作日内到账。")]);

		const result = await runtime.run(request({ text: "退款多久到账？" }));

		expect(result.type).toBe("fallback");
		expect(result.toolsCalled).toEqual([]);
		expect(result.sessionEvents.some((event) => event.type === "agent_end")).toBe(true);
	});

	it("returns controlled fallback when knowledge search has no evidence", async () => {
		const runtime = createRuntime([
			fauxAssistantMessage(
				[{ type: "toolCall", id: "kb-1", name: "search_knowledge", arguments: { query: "退款" } }],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("退款会在一个工作日内到账。"),
		]);

		const result = await runtime.run(request({ text: "退款多久到账？" }));

		expect(result.type).toBe("fallback");
		expect(result.toolsCalled).toEqual(["search_knowledge"]);
		expect(result.sessionEvents.filter((event) => event.type === "message_end").length).toBeGreaterThanOrEqual(3);
	});

	it("answers from read-only knowledge evidence", async () => {
		const runtime = createRuntime(
			[
				fauxAssistantMessage(
					[{ type: "toolCall", id: "kb-1", name: "search_knowledge", arguments: { query: "退款" } }],
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage("退款会在申请后五个工作日内原路退回。"),
			],
			{
				retrieval: new InMemoryRetrievalService([
					{ id: "refund-policy", text: "退款会在申请后五个工作日内原路退回。" },
				]),
			},
		);

		const result = await runtime.run(request({ text: "退款多久到账？" }));

		expect(result.type).toBe("answer");
		expect(result.toolsCalled).toEqual(["search_knowledge"]);
		expect(result.sessionEvents.some((event) => event.type === "tool_execution_end" && !event.isError)).toBe(true);
	});

	it("returns controlled fallback when Pi rejects invalid tool parameters", async () => {
		const runtime = createRuntime([
			fauxAssistantMessage([{ type: "toolCall", id: "invalid-1", name: "search_faq", arguments: {} }], {
				stopReason: "toolUse",
			}),
			fauxAssistantMessage("营业时间是全天。"),
		]);

		const result = await runtime.run(request());

		expect(result.type).toBe("fallback");
		expect(result.toolsCalled).toEqual(["search_faq"]);
		expect(result.sessionEvents.some((event) => event.type === "tool_execution_end" && event.isError)).toBe(true);
	});

	it("blocks a duplicate ticket before a second side effect can run", async () => {
		const store = new InMemorySupportStore();
		const runtime = createRuntime(
			[
				fauxAssistantMessage(
					[
						{
							type: "toolCall",
							id: "ticket-1",
							name: "create_ticket",
							arguments: { summary: "顾客要求退款", idempotencyKey: "refund-1" },
						},
					],
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage("已记录您的工单。"),
				fauxAssistantMessage(
					[
						{
							type: "toolCall",
							id: "ticket-2",
							name: "create_ticket",
							arguments: { summary: "顾客要求退款", idempotencyKey: "refund-1" },
						},
					],
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage("已记录您的工单。"),
			],
			{ store },
		);

		const first = await runtime.run(request({ permissions: ["tickets:write"] }));
		const second = await runtime.run(request({ permissions: ["tickets:write"] }));

		expect(first.type).toBe("answer");
		expect(second.type).toBe("fallback");
		expect(store.getTickets()).toHaveLength(1);
		expect(store.getTicketCreationAttempts()).toBe(1);
		expect(second.toolsCalled).toEqual(["create_ticket"]);
		expect(second.sessionEvents.some((event) => event.type === "tool_execution_end" && event.isError)).toBe(true);
	});

	it("prevents duplicate ticket execution when two runs race on the same idempotency key", async () => {
		const faux = registerFauxProvider();
		registrations.push(faux);
		faux.setResponses([
			fauxAssistantMessage(
				[
					{
						type: "toolCall",
						id: "ticket-race-1",
						name: "create_ticket",
						arguments: { summary: "顾客要求退款", idempotencyKey: "race-key" },
					},
				],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage(
				[
					{
						type: "toolCall",
						id: "ticket-race-2",
						name: "create_ticket",
						arguments: { summary: "顾客要求退款", idempotencyKey: "race-key" },
					},
				],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("已记录您的工单。"),
			fauxAssistantMessage("已记录您的工单。"),
		]);
		const store = new InMemorySupportStore();
		const runtime = new SupportAgentRuntime({
			model: faux.getModel(),
			streamFn: streamSimple,
			retrieval: new InMemoryRetrievalService(),
			store,
			faq: [],
		});

		const results = await Promise.all([
			runtime.run(request({ conversationId: "conversation-race-1", permissions: ["tickets:write"] })),
			runtime.run(request({ conversationId: "conversation-race-2", permissions: ["tickets:write"] })),
		]);

		expect(store.getTickets()).toHaveLength(1);
		expect(store.getTicketCreationAttempts()).toBe(1);
		expect(results.filter((result) => result.type === "fallback")).toHaveLength(1);
	});

	it("escalates authorized human handoff instead of returning a normal answer", async () => {
		const store = new InMemorySupportStore();
		const runtime = createRuntime(
			[
				fauxAssistantMessage(
					[{ type: "toolCall", id: "human-1", name: "handoff_to_human", arguments: { reason: "顾客投诉升级" } }],
					{ stopReason: "toolUse" },
				),
			],
			{ store },
		);

		const result = await runtime.run(request({ mayEscalate: true, permissions: ["handoff:write"] }));

		expect(result.type).toBe("escalation");
		expect(result.toolsCalled).toEqual(["handoff_to_human"]);
		expect(store.getHandoffs()).toEqual([{ conversationId: "conversation-1", reason: "顾客投诉升级" }]);
		expect(result.sessionEvents.some((event) => event.type === "tool_execution_end")).toBe(true);
	});

	it("blocks a repeated human handoff before another side effect is created", async () => {
		const store = new InMemorySupportStore();
		const runtime = createRuntime(
			[
				fauxAssistantMessage(
					[{ type: "toolCall", id: "handoff-1", name: "handoff_to_human", arguments: { reason: "投诉升级" } }],
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage(
					[{ type: "toolCall", id: "handoff-2", name: "handoff_to_human", arguments: { reason: "再次升级" } }],
					{ stopReason: "toolUse" },
				),
			],
			{ store },
		);

		const first = await runtime.run(request({ mayEscalate: true, permissions: ["handoff:write"] }));
		const second = await runtime.run(request({ mayEscalate: true, permissions: ["handoff:write"] }));

		expect(first.type).toBe("escalation");
		expect(second.type).toBe("fallback");
		expect(store.getHandoffs()).toEqual([{ conversationId: "conversation-1", reason: "投诉升级" }]);
		expect(second.sessionEvents.some((event) => event.type === "tool_execution_end" && event.isError)).toBe(true);
	});

	it("prevents duplicate handoff creation when two runs race for the same conversation", async () => {
		const faux = registerFauxProvider();
		registrations.push(faux);
		faux.setResponses([
			fauxAssistantMessage(
				[{ type: "toolCall", id: "handoff-race-1", name: "handoff_to_human", arguments: { reason: "投诉升级" } }],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage(
				[{ type: "toolCall", id: "handoff-race-2", name: "handoff_to_human", arguments: { reason: "再次升级" } }],
				{ stopReason: "toolUse" },
			),
		]);
		const store = new InMemorySupportStore();
		const runtime = new SupportAgentRuntime({
			model: faux.getModel(),
			streamFn: streamSimple,
			retrieval: new InMemoryRetrievalService(),
			store,
			faq: [],
		});

		const results = await Promise.all([
			runtime.run(request({ mayEscalate: true, permissions: ["handoff:write"] })),
			runtime.run(request({ mayEscalate: true, permissions: ["handoff:write"] })),
		]);

		expect(store.getHandoffs()).toHaveLength(1);
		expect(results.filter((result) => result.type === "fallback")).toHaveLength(1);
	});

	it("does not return a normal answer when the application requires escalation", async () => {
		const runtime = createRuntime([fauxAssistantMessage("请耐心等待处理。")]);

		const result = await runtime.run(request({ requiresEscalation: true }));

		expect(result.type).toBe("fallback");
		expect(result.toolsCalled).toEqual([]);
		expect(result.sessionEvents.some((event) => event.type === "agent_end")).toBe(true);
	});

	it("blocks an unsupported promise that a side effect has completed", async () => {
		const runtime = createRuntime([fauxAssistantMessage("您的退款已完成。")]);

		const result = await runtime.run(request({ text: "我的退款处理好了吗？" }));

		expect(result.type).toBe("fallback");
		expect(result.toolsCalled).toEqual([]);
		expect(result.sessionEvents.some((event) => event.type === "agent_end")).toBe(true);
	});

	it("terminates safely at the configured tool-call budget", async () => {
		const runtime = createRuntime(
			[
				fauxAssistantMessage(
					[{ type: "toolCall", id: "faq-1", name: "search_faq", arguments: { query: "营业时间" } }],
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage(
					[{ type: "toolCall", id: "faq-2", name: "search_faq", arguments: { query: "营业时间" } }],
					{ stopReason: "toolUse" },
				),
			],
			{ limits: { maxToolCalls: 1 } },
		);

		const result = await runtime.run(request());

		expect(result.type).toBe("fallback");
		expect(result.toolsCalled).toEqual(["search_faq", "search_faq"]);
		expect(result.sessionEvents.some((event) => event.type === "tool_execution_end" && event.isError)).toBe(true);
	});

	it("enforces the tool-call budget within one multi-tool Pi turn", async () => {
		const runtime = createRuntime(
			[
				fauxAssistantMessage(
					[
						{ type: "toolCall", id: "faq-batch-1", name: "search_faq", arguments: { query: "营业时间" } },
						{ type: "toolCall", id: "faq-batch-2", name: "search_faq", arguments: { query: "营业时间" } },
					],
					{ stopReason: "toolUse" },
				),
			],
			{ limits: { maxToolCalls: 1 } },
		);

		const result = await runtime.run(request());

		expect(result.type).toBe("fallback");
		expect(result.toolsCalled).toEqual(["search_faq", "search_faq"]);
		expect(result.sessionEvents.filter((event) => event.type === "tool_execution_end" && event.isError)).toHaveLength(
			1,
		);
	});

	it("terminates safely at the configured agent-turn budget", async () => {
		const runtime = createRuntime(
			[
				fauxAssistantMessage(
					[{ type: "toolCall", id: "faq-1", name: "search_faq", arguments: { query: "营业时间" } }],
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage("门店每天 09:00-21:00 营业。"),
			],
			{ limits: { maxAgentTurns: 1 } },
		);

		const result = await runtime.run(request());

		expect(result.type).toBe("fallback");
		expect(result.toolsCalled).toEqual(["search_faq"]);
		expect(result.sessionEvents.some((event) => event.type === "turn_end")).toBe(true);
	});

	it("does not invoke another Pi provider turn after reaching the agent-turn budget", async () => {
		let providerCalls = 0;
		const faux = registerFauxProvider();
		registrations.push(faux);
		faux.setResponses([
			() => {
				providerCalls += 1;
				return fauxAssistantMessage(
					[{ type: "toolCall", id: "turn-budget-tool", name: "search_faq", arguments: { query: "营业时间" } }],
					{ stopReason: "toolUse" },
				);
			},
			() => {
				providerCalls += 1;
				return fauxAssistantMessage("this turn must not run");
			},
		]);
		const runtime = new SupportAgentRuntime({
			model: faux.getModel(),
			streamFn: streamSimple,
			retrieval: new InMemoryRetrievalService(),
			store: new InMemorySupportStore(),
			faq: [{ question: "营业时间", answer: "门店每天 09:00-21:00 营业。" }],
			limits: { maxAgentTurns: 1 },
		});

		const result = await runtime.run(request());

		expect(result.type).toBe("fallback");
		expect(providerCalls).toBe(1);
		expect(result.sessionEvents.some((event) => event.type === "turn_end")).toBe(true);
	});

	it("restores a mapped Pi JSONL session in a new runtime and store", async () => {
		const directory = mkdtempSync(join(tmpdir(), "pi-support-session-"));
		try {
			const faux = registerFauxProvider();
			registrations.push(faux);
			faux.setResponses([fauxAssistantMessage("首次答复。"), fauxAssistantMessage("恢复后的答复。")]);
			const initialStore = new InMemorySupportStore();
			const initialRuntime = new SupportAgentRuntime({
				model: faux.getModel(),
				streamFn: streamSimple,
				retrieval: new InMemoryRetrievalService(),
				store: initialStore,
				faq: [],
				sessionDirectory: directory,
			});

			const first = await initialRuntime.run(request());
			const resumedStore = new InMemorySupportStore(initialStore.exportSessionMappings());
			const resumedRuntime = new SupportAgentRuntime({
				model: faux.getModel(),
				streamFn: streamSimple,
				retrieval: new InMemoryRetrievalService(),
				store: resumedStore,
				faq: [],
				sessionDirectory: directory,
			});
			const second = await resumedRuntime.run(request({ text: "继续处理" }));
			const restored = SessionManager.open(
				resumedRuntime.getSessionFile("conversation-1")!,
				directory,
				process.cwd(),
			);

			expect(second.piSessionId).toBe(first.piSessionId);
			expect(resumedRuntime.getSessionFile("conversation-1")).toMatch(/\.jsonl$/);
			expect(restored.getSessionId()).toBe(first.piSessionId);
			expect(
				restored
					.getEntries()
					.filter((entry) => entry.type === "message")
					.map((entry) => JSON.stringify(entry.message))
					.join("\n"),
			).toContain("首次答复。");
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("supplies restored Pi session history to the resumed provider context", async () => {
		const directory = mkdtempSync(join(tmpdir(), "pi-support-session-context-"));
		try {
			const faux = registerFauxProvider();
			registrations.push(faux);
			let resumedContext = "";
			faux.setResponses([
				fauxAssistantMessage("首次答复。"),
				(context) => {
					resumedContext = JSON.stringify(context.messages);
					return fauxAssistantMessage("恢复后的答复。");
				},
			]);
			const initialStore = new InMemorySupportStore();
			const initialRuntime = new SupportAgentRuntime({
				model: faux.getModel(),
				streamFn: streamSimple,
				retrieval: new InMemoryRetrievalService(),
				store: initialStore,
				faq: [],
				sessionDirectory: directory,
			});

			await initialRuntime.run(request({ text: "第一轮咨询" }));
			const resumedRuntime = new SupportAgentRuntime({
				model: faux.getModel(),
				streamFn: streamSimple,
				retrieval: new InMemoryRetrievalService(),
				store: new InMemorySupportStore(initialStore.exportSessionMappings()),
				faq: [],
				sessionDirectory: directory,
			});

			const resumed = await resumedRuntime.run(request({ text: "第二轮咨询" }));

			expect(resumed.type).toBe("answer");
			expect(resumedContext).toContain("第一轮咨询");
			expect(resumedContext).toContain("首次答复。");
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("persists support audit metadata in the Pi JSONL session", async () => {
		const directory = mkdtempSync(join(tmpdir(), "pi-support-audit-"));
		try {
			const faux = registerFauxProvider();
			registrations.push(faux);
			faux.setResponses([fauxAssistantMessage("已记录。")]);
			const persistentRuntime = new SupportAgentRuntime({
				model: faux.getModel(),
				streamFn: streamSimple,
				retrieval: new InMemoryRetrievalService(),
				store: new InMemorySupportStore(),
				faq: [],
				sessionDirectory: directory,
			});

			const result = await persistentRuntime.run(request());
			const restored = SessionManager.open(
				persistentRuntime.getSessionFile("conversation-1")!,
				directory,
				process.cwd(),
			);
			const auditEntries = restored
				.getEntries()
				.filter(
					(entry): entry is CustomEntry => entry.type === "custom" && entry.customType === "support-agent.audit",
				);

			expect(auditEntries).toHaveLength(1);
			expect(auditEntries[0]?.data).toMatchObject({ outcome: "answer", toolsCalled: [] });
			expect(result.type).toBe("answer");
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("keeps per-run tool budgets and audit records consistent after session resume", async () => {
		const directory = mkdtempSync(join(tmpdir(), "pi-support-session-budget-"));
		try {
			const faux = registerFauxProvider();
			registrations.push(faux);
			faux.setResponses([
				fauxAssistantMessage(
					[{ type: "toolCall", id: "session-budget-1", name: "search_faq", arguments: { query: "营业时间" } }],
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage("门店每天 09:00-21:00 营业。"),
				fauxAssistantMessage(
					[{ type: "toolCall", id: "session-budget-2", name: "search_faq", arguments: { query: "营业时间" } }],
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage("门店每天 09:00-21:00 营业。"),
			]);
			const initialStore = new InMemorySupportStore();
			const options = {
				model: faux.getModel(),
				streamFn: streamSimple,
				retrieval: new InMemoryRetrievalService(),
				faq: [{ question: "营业时间", answer: "门店每天 09:00-21:00 营业。" }],
				sessionDirectory: directory,
				limits: { maxToolCalls: 1 },
			};
			const initialRuntime = new SupportAgentRuntime({ ...options, store: initialStore });

			const first = await initialRuntime.run(request({ text: "第一轮营业时间" }));
			const resumedRuntime = new SupportAgentRuntime({
				...options,
				store: new InMemorySupportStore(initialStore.exportSessionMappings()),
			});
			const second = await resumedRuntime.run(request({ text: "第二轮营业时间" }));
			const restored = SessionManager.open(
				resumedRuntime.getSessionFile("conversation-1")!,
				directory,
				process.cwd(),
			);
			const auditEntries = restored
				.getEntries()
				.filter(
					(entry): entry is CustomEntry => entry.type === "custom" && entry.customType === "support-agent.audit",
				);

			expect(first.type).toBe("answer");
			expect(second.type).toBe("answer");
			expect(first.toolsCalled).toEqual(["search_faq"]);
			expect(second.toolsCalled).toEqual(["search_faq"]);
			expect(auditEntries.map((entry) => entry.data)).toMatchObject([
				{ outcome: "answer", toolsCalled: ["search_faq"], toolCalls: 1, limitReached: false },
				{ outcome: "answer", toolsCalled: ["search_faq"], toolCalls: 1, limitReached: false },
			]);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("stops a slow knowledge lookup at the per-tool deadline", async () => {
		const slowRetrieval: RetrievalService = {
			search: () =>
				new Promise((resolve) => setTimeout(() => resolve([{ id: "late", text: "late evidence" }]), 100)),
		};
		const runtime = createRuntime(
			[
				fauxAssistantMessage(
					[{ type: "toolCall", id: "slow-kb", name: "search_knowledge", arguments: { query: "退款" } }],
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage("退款会在五个工作日内到账。"),
			],
			{ retrieval: slowRetrieval, limits: { perToolTimeoutMs: 10 } },
		);

		const startedAt = Date.now();
		const result = await runtime.run(request({ text: "退款多久到账？" }));

		expect(Date.now() - startedAt).toBeLessThan(80);
		expect(result.type).toBe("fallback");
		expect(result.sessionEvents.some((event) => event.type === "tool_execution_end" && event.isError)).toBe(true);
	});

	it("propagates tool cancellation to the retrieval provider", async () => {
		let retrievalSignal: AbortSignal | undefined;
		const retrieval: RetrievalService = {
			search: (_query, signal) =>
				new Promise((resolve) => {
					retrievalSignal = signal;
					signal?.addEventListener("abort", () => resolve([]), { once: true });
				}),
		};
		const runtime = createRuntime(
			[
				fauxAssistantMessage(
					[{ type: "toolCall", id: "cancel-kb", name: "search_knowledge", arguments: { query: "退款" } }],
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage("退款会在五个工作日内到账。"),
			],
			{ retrieval, limits: { perToolTimeoutMs: 10 } },
		);

		const result = await runtime.run(request({ text: "退款多久到账？" }));

		expect(result.type).toBe("fallback");
		expect(retrievalSignal?.aborted).toBe(true);
		expect(result.sessionEvents.some((event) => event.type === "tool_execution_end" && event.isError)).toBe(true);
	});

	it("rejects unrecognized tool arguments with the strict runtime schema", async () => {
		const runtime = createRuntime([
			fauxAssistantMessage(
				[
					{
						type: "toolCall",
						id: "faq-extra",
						name: "search_faq",
						arguments: { query: "营业时间", bypass: true },
					},
				],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("门店每天 09:00-21:00 营业。"),
		]);

		const result = await runtime.run(request());

		expect(result.type).toBe("fallback");
		expect(result.sessionEvents.some((event) => event.type === "tool_execution_end" && event.isError)).toBe(true);
	});

	it.each([
		["search_knowledge", {}],
		["create_ticket", { summary: "顾客要求退款", idempotencyKey: "ticket-extra", bypass: true }],
		["handoff_to_human", { reason: "投诉升级", bypass: true }],
	] as const)("rejects malformed %s arguments before the tool can execute", async (toolName, arguments_) => {
		const runtime = createRuntime([
			fauxAssistantMessage(
				[{ type: "toolCall", id: `${toolName}-invalid`, name: toolName, arguments: arguments_ }],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("已完成。"),
		]);

		const result = await runtime.run(request());

		expect(result.type).toBe("fallback");
		expect(result.toolsCalled).toEqual([toolName]);
		expect(result.sessionEvents.some((event) => event.type === "tool_execution_end" && event.isError)).toBe(true);
	});

	it("returns controlled fallback for an empty provider response", async () => {
		const runtime = createRuntime([fauxAssistantMessage("")]);

		const result = await runtime.run(request());

		expect(result.type).toBe("fallback");
		expect(result.toolsCalled).toEqual([]);
		expect(result.sessionEvents.some((event) => event.type === "agent_start")).toBe(true);
	});

	it("does not re-enter the Pi provider loop after an empty response", async () => {
		let providerCalls = 0;
		const faux = registerFauxProvider();
		registrations.push(faux);
		faux.setResponses([
			() => {
				providerCalls += 1;
				return fauxAssistantMessage("");
			},
			() => {
				providerCalls += 1;
				return fauxAssistantMessage("this response must not be requested");
			},
		]);
		const runtime = new SupportAgentRuntime({
			model: faux.getModel(),
			streamFn: streamSimple,
			retrieval: new InMemoryRetrievalService(),
			store: new InMemorySupportStore(),
			faq: [],
		});

		const result = await runtime.run(request());

		expect(result.type).toBe("fallback");
		expect(providerCalls).toBe(1);
		expect(result.sessionEvents.some((event) => event.type === "agent_end")).toBe(true);
	});

	it("returns controlled fallback when the overall provider deadline expires", async () => {
		const faux = registerFauxProvider({ tokensPerSecond: 1, tokenSize: { min: 1, max: 1 } });
		registrations.push(faux);
		faux.setResponses([fauxAssistantMessage("this response cannot finish before the deadline")]);
		const runtime = new SupportAgentRuntime({
			model: faux.getModel(),
			streamFn: streamSimple,
			retrieval: new InMemoryRetrievalService(),
			store: new InMemorySupportStore(),
			faq: [],
			limits: { overallTurnTimeoutMs: 10 },
		});

		const result = await runtime.run(request());

		expect(result.type).toBe("fallback");
		expect(result.toolsCalled).toEqual([]);
		expect(result.sessionEvents.some((event) => event.type === "agent_start")).toBe(true);
	});

	it("returns after the overall deadline even when a provider stream ignores abort", async () => {
		const faux = registerFauxProvider();
		registrations.push(faux);
		const stalledStreamFn: StreamFn = () =>
			new EventStream<AssistantMessageEvent, AssistantMessage>(
				(event) => event.type === "done" || event.type === "error",
				(event) => {
					if (event.type === "done") return event.message;
					if (event.type === "error") return event.error;
					throw new Error("Unexpected event type");
				},
			);
		const runtime = new SupportAgentRuntime({
			model: faux.getModel(),
			streamFn: stalledStreamFn,
			retrieval: new InMemoryRetrievalService(),
			store: new InMemorySupportStore(),
			faq: [],
			limits: { overallTurnTimeoutMs: 10 },
		});

		const outcome = await Promise.race([
			runtime.run(request()),
			new Promise<"did-not-return">((resolve) => setTimeout(() => resolve("did-not-return"), 100)),
		]);

		expect(outcome).not.toBe("did-not-return");
		expect((outcome as { type: string }).type).toBe("fallback");
	});

	it("does not append late provider events after returning an overall-timeout fallback", async () => {
		const faux = registerFauxProvider();
		registrations.push(faux);
		const lateStreamFn: StreamFn = () => {
			const stream = new EventStream<AssistantMessageEvent, AssistantMessage>(
				(event) => event.type === "done" || event.type === "error",
				(event) => {
					if (event.type === "done") return event.message;
					if (event.type === "error") return event.error;
					throw new Error("Unexpected event type");
				},
			);
			setTimeout(() => {
				const message = fauxAssistantMessage("迟到的答复。");
				stream.push({ type: "done", reason: "stop", message });
			}, 30);
			return stream;
		};
		const runtime = new SupportAgentRuntime({
			model: faux.getModel(),
			streamFn: lateStreamFn,
			retrieval: new InMemoryRetrievalService(),
			store: new InMemorySupportStore(),
			faq: [],
			limits: { overallTurnTimeoutMs: 10 },
		});

		const result = await runtime.run(request());
		const eventsAtReturn = result.sessionEvents.length;
		await new Promise((resolve) => setTimeout(resolve, 60));

		expect(result.type).toBe("fallback");
		expect(result.sessionEvents).toHaveLength(eventsAtReturn);
	});

	it("persists a timeout audit trail when an unresponsive provider produces no assistant message", async () => {
		const directory = mkdtempSync(join(tmpdir(), "pi-support-timeout-audit-"));
		try {
			const faux = registerFauxProvider();
			registrations.push(faux);
			const stalledStreamFn: StreamFn = () =>
				new EventStream<AssistantMessageEvent, AssistantMessage>(
					(event) => event.type === "done" || event.type === "error",
					(event) => {
						if (event.type === "done") return event.message;
						if (event.type === "error") return event.error;
						throw new Error("Unexpected event type");
					},
				);
			const runtime = new SupportAgentRuntime({
				model: faux.getModel(),
				streamFn: stalledStreamFn,
				retrieval: new InMemoryRetrievalService(),
				store: new InMemorySupportStore(),
				faq: [],
				sessionDirectory: directory,
				limits: { overallTurnTimeoutMs: 10 },
			});

			const result = await runtime.run(request());
			const sessionFile = runtime.getSessionFile("conversation-1");

			expect(result.type).toBe("fallback");
			expect(sessionFile).toMatch(/\.jsonl$/);
			const restored = SessionManager.open(sessionFile!, directory, process.cwd());
			expect(
				restored
					.getEntries()
					.some((entry) => entry.type === "custom" && entry.customType === "support-agent.audit"),
			).toBe(true);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("uses the configured fallback model only after a provider failure", async () => {
		const faux = registerFauxProvider();
		registrations.push(faux);
		faux.setResponses([
			() => {
				throw new Error("primary unavailable");
			},
			fauxAssistantMessage("备用模型答复。"),
		]);
		const runtime = new SupportAgentRuntime({
			model: faux.getModel(),
			fallbackModel: { ...faux.getModel(), id: "fallback-model" },
			streamFn: streamSimple,
			retrieval: new InMemoryRetrievalService(),
			store: new InMemorySupportStore(),
			faq: [],
		});

		const result = await runtime.run(request());

		expect(result.type).toBe("answer");
		expect(result.text).toBe("备用模型答复。");
		expect(result.sessionEvents.filter((event) => event.type === "agent_end")).toHaveLength(2);
	});

	it("keeps restored history when provider fallback handles a resumed session", async () => {
		const directory = mkdtempSync(join(tmpdir(), "pi-support-fallback-session-"));
		try {
			const faux = registerFauxProvider();
			registrations.push(faux);
			let fallbackContext = "";
			faux.setResponses([
				fauxAssistantMessage("首次答复。"),
				() => {
					throw new Error("primary unavailable");
				},
				(context) => {
					fallbackContext = JSON.stringify(context.messages);
					return fauxAssistantMessage("备用模型答复。");
				},
			]);
			const initialStore = new InMemorySupportStore();
			const runtimeOptions = {
				model: faux.getModel(),
				fallbackModel: { ...faux.getModel(), id: "fallback-model" },
				streamFn: streamSimple,
				retrieval: new InMemoryRetrievalService(),
				faq: [],
				sessionDirectory: directory,
			};
			const initialRuntime = new SupportAgentRuntime({ ...runtimeOptions, store: initialStore });

			await initialRuntime.run(request({ text: "第一轮咨询" }));
			const resumedRuntime = new SupportAgentRuntime({
				...runtimeOptions,
				store: new InMemorySupportStore(initialStore.exportSessionMappings()),
			});
			const result = await resumedRuntime.run(request({ text: "第二轮咨询" }));

			expect(result.type).toBe("answer");
			expect(fallbackContext).toContain("第一轮咨询");
			expect(fallbackContext).toContain("首次答复。");
			expect(fallbackContext.match(/第二轮咨询/g)).toHaveLength(1);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("loads matching Pi skill instructions without exposing filesystem tools", async () => {
		const directory = mkdtempSync(join(tmpdir(), "pi-support-skills-"));
		try {
			const skillDirectory = join(directory, "complaint");
			mkdirSync(skillDirectory, { recursive: true });
			writeFileSync(
				join(skillDirectory, "SKILL.md"),
				"---\nname: complaint\ndescription: Handle customer complaints.\n---\n\nAcknowledge the complaint before offering the approved next step.\n",
			);
			const faux = registerFauxProvider();
			registrations.push(faux);
			faux.setResponses([
				(context) => {
					expect(context.systemPrompt).toContain("<available_skills>");
					expect(context.systemPrompt).toContain("Acknowledge the complaint");
					expect(context.tools?.map((tool) => tool.name)).toEqual([
						"search_faq",
						"search_knowledge",
						"create_ticket",
						"handoff_to_human",
					]);
					return fauxAssistantMessage("已收到您的投诉，我会协助您处理。");
				},
			]);
			const runtime = new SupportAgentRuntime({
				model: faux.getModel(),
				streamFn: streamSimple,
				retrieval: new InMemoryRetrievalService(),
				store: new InMemorySupportStore(),
				faq: [],
				skillsDirectory: directory,
			});

			const result = await runtime.run(request({ text: "我要投诉服务态度" }));

			expect(result.type).toBe("answer");
			expect(result.toolsCalled).toEqual([]);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("loads product-owned default skills without a Pi project layout", async () => {
		const faux = registerFauxProvider();
		registrations.push(faux);
		faux.setResponses([
			(context) => {
				expect(context.systemPrompt).toContain("Acknowledge the complaint before offering the approved next step.");
				expect(context.tools?.map((tool) => tool.name)).toEqual([
					"search_faq",
					"search_knowledge",
					"create_ticket",
					"handoff_to_human",
				]);
				return fauxAssistantMessage("已收到您的投诉，我会协助您处理。");
			},
		]);
		const runtime = new SupportAgentRuntime({
			model: faux.getModel(),
			streamFn: streamSimple,
			retrieval: new InMemoryRetrievalService(),
			store: new InMemorySupportStore(),
			faq: [],
		});

		const result = await runtime.run(request({ text: "我要投诉服务态度" }));

		expect(result.type).toBe("answer");
	});
});
