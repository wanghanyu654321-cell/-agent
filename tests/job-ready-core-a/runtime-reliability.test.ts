import { mkdtempSync, rmSync } from "node:fs";
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
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	InMemorySupportStore,
	type RetrievalEvidence,
	SupportAgentRuntime,
	type SupportAgentRuntimeOptions,
} from "../../src/index.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
	while (cleanups.length) cleanups.pop()?.();
});
const entry = (id = "approved"): RetrievalEvidence => ({
	id,
	text: `CANONICAL_${id}`,
	knowledge: { kind: "policy", status: "approved", version: "v1", sourceRef: `test://${id}` },
});
const tool = (name: string, args: Record<string, unknown>) =>
	fauxAssistantMessage([{ type: "toolCall", id: `${name}-call`, name, arguments: args }], { stopReason: "toolUse" });
function setup(
	evidence: RetrievalEvidence[],
	responses = [fauxAssistantMessage("provider prose")],
	overrides: Partial<SupportAgentRuntimeOptions> = {},
) {
	const directory = mkdtempSync(join(tmpdir(), "core-a-runtime-"));
	const faux = registerFauxProvider();
	faux.setResponses(responses);
	cleanups.push(() => {
		faux.unregister();
		rmSync(directory, { recursive: true, force: true });
	});
	const calls: string[] = [];
	const runtime = new SupportAgentRuntime({
		model: faux.getModel(),
		streamFn: streamSimple,
		store: new InMemorySupportStore(),
		faq: [],
		retrieval: {
			search: async (query) => {
				calls.push(query);
				return evidence;
			},
		},
		sessionDirectory: directory,
		...overrides,
	});
	const run = (extra = {}) =>
		runtime.run({
			conversationId: "core-a",
			tenantId: "tenant-a",
			storeId: "store-a",
			customerId: "customer-a",
			text: "original ordinary request",
			...extra,
		});
	const audit = () =>
		SessionManager.open(runtime.getSessionFile("core-a")!, directory, process.cwd())
			.getEntries()
			.filter((e): e is CustomEntry => e.type === "custom" && e.customType === "support-agent.audit")
			.at(-1)?.data;
	return { run, calls, audit };
}
function hangingStream(): EventStream<AssistantMessageEvent, AssistantMessage> {
	return new EventStream(
		(e) => e.type === "done" || e.type === "error",
		(e) => {
			if (e.type === "done") return e.message;
			if (e.type === "error") return e.error;
			throw new Error("unexpected");
		},
	);
}

describe("Core A policy lookup and deadline evidence", () => {
	it("does not accept a completed read after wall-clock expiry while timer delivery is delayed", async () => {
		let now = Date.now();
		const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
		try {
			const test = setup([], undefined, {
				limits: { overallTurnTimeoutMs: 20 },
				retrieval: {
					search: async () => {
						now += 30;
						return [entry()];
					},
				},
			});
			const result = await test.run();
			expect(result.type).toBe("fallback");
			expect(result.evidence).toEqual([]);
		} finally {
			clock.mockRestore();
		}
	});
	it.each([0, 1, 2])(
		"performs the original request check without a model tool choice (%i candidates)",
		async (count) => {
			const test = setup(Array.from({ length: count }, (_, i) => entry(`id-${i}`)));
			const result = await test.run();
			expect(test.calls).toEqual(["original ordinary request"]);
			expect(result.type).toBe(count === 1 ? "answer" : "fallback");
			expect(result.evidence.map((e) => e.id)).toEqual(count === 1 ? ["id-0"] : []);
			expect(result.toolsCalled).toEqual(["search_knowledge"]);
			expect(result.sessionEvents.some((e) => e.type === "tool_execution_start")).toBe(false);
			expect(test.audit()).toMatchObject({
				knowledgeChecks: [
					{ knowledgeCheckOrigin: "policy", query: "original ordinary request", status: "completed" },
				],
				toolCalls: 1,
			});
		},
	);
	it("reuses the completed policy check in a real Pi tool event without double budget", async () => {
		const test = setup(
			[entry()],
			[tool("search_knowledge", { query: "original ordinary request" }), fauxAssistantMessage("late prose")],
			{ limits: { maxToolCalls: 1 } },
		);
		const result = await test.run();
		expect(result.type).toBe("answer");
		expect(test.calls).toHaveLength(1);
		expect(result.toolsCalled).toEqual(["search_knowledge"]);
		expect(result.sessionEvents.some((e) => e.type === "tool_execution_end")).toBe(true);
		expect(test.audit()).toMatchObject({ toolCalls: 1, limitReached: false });
	});
	it("preserves canonical single evidence at provider deadline and seals late events", async () => {
		let pending: ReturnType<typeof hangingStream> | undefined;
		let providerSignal: AbortSignal | undefined;
		const streamFn: StreamFn = (_model, _context, options) => {
			providerSignal = options?.signal;
			pending = hangingStream();
			return pending;
		};
		const test = setup([entry()], undefined, { streamFn, limits: { overallTurnTimeoutMs: 40 } });
		const result = await test.run();
		const serialized = JSON.stringify(result);
		const audit = JSON.stringify(test.audit());
		expect(result.type).toBe("answer");
		expect(result.text).toBe("CANONICAL_approved");
		expect(providerSignal?.aborted).toBe(true);
		pending?.push({ type: "done", reason: "stop", message: fauxAssistantMessage("UNTRUSTED_LATE") });
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(JSON.stringify(result)).toBe(serialized);
		expect(JSON.stringify(test.audit())).toBe(audit);
		expect(test.audit()).toMatchObject({
			timedOut: true,
			outcome: "answer",
			grounding: { evidence: result.evidence },
		});
	});
	it("does not authorize a lookup completing after deadline", async () => {
		let release: (value: RetrievalEvidence[]) => void = () => {};
		const test = setup([], undefined, {
			limits: { overallTurnTimeoutMs: 20 },
			retrieval: {
				search: () =>
					new Promise((resolve) => {
						release = resolve;
					}),
			},
		});
		const result = await test.run();
		const before = JSON.stringify(result);
		expect(result.type).toBe("fallback");
		release([entry()]);
		await new Promise((resolve) => setTimeout(resolve, 5));
		expect(JSON.stringify(result)).toBe(before);
		expect(result.evidence).toEqual([]);
	});
	it("later ambiguity supersedes a completed single snapshot", async () => {
		const test = setup([], [tool("search_knowledge", { query: "different query" }), fauxAssistantMessage("prose")], {
			retrieval: { search: async (q) => (q === "original ordinary request" ? [entry()] : [entry("a"), entry("b")]) },
		});
		const result = await test.run();
		expect(result.type).toBe("fallback");
		expect(result.evidence).toEqual([]);
	});
	it("an in-flight different Pi lookup prevents deadline reuse of the policy snapshot", async () => {
		let release: (value: RetrievalEvidence[]) => void = () => {};
		const calls: string[] = [];
		let laterSignal: AbortSignal | undefined;
		const test = setup([], [tool("search_knowledge", { query: "different pending query" })], {
			limits: { overallTurnTimeoutMs: 80 },
			retrieval: {
				search: async (query, signal) => {
					calls.push(query);
					if (query === "original ordinary request") return [entry("snapshot-a")];
					laterSignal = signal;
					return new Promise((resolve) => {
						release = resolve;
					});
				},
			},
		});
		const result = await test.run();
		expect(calls).toEqual(["original ordinary request", "different pending query"]);
		expect(result.sessionEvents.some((event) => event.type === "tool_execution_start")).toBe(true);
		expect(laterSignal?.aborted).toBe(true);
		expect(result.type).toBe("fallback");
		expect(result.evidence).toEqual([]);
		expect(test.audit()).toMatchObject({
			timedOut: true,
			knowledgeRouting: { authorizedEvidenceIds: [] },
		});
		const before = JSON.stringify({ result, audit: test.audit() });
		release([entry("late-b")]);
		await new Promise((resolve) => setTimeout(resolve, 5));
		expect(JSON.stringify({ result, audit: test.audit() })).toBe(before);
	});
	it("authority-blocked tool beats the policy evidence", async () => {
		const test = setup([entry()], [tool("create_ticket", { summary: "test", idempotencyKey: "key" })]);
		const result = await test.run();
		expect(result.type).toBe("fallback");
		expect(result.evidence).toEqual([]);
	});
	it("Safety does not run the ordinary policy precheck", async () => {
		const test = setup([entry()]);
		const result = await test.run({ text: "顾客出现过敏" });
		expect(test.calls).toEqual([]);
		expect(result.type).toBe("escalation");
		expect(result.evidence).toEqual([]);
	});
	it("keeps a successfully authorized ticket outcome after a policy miss", async () => {
		const store = new InMemorySupportStore();
		const test = setup(
			[],
			[tool("create_ticket", { summary: "test", idempotencyKey: "key" }), fauxAssistantMessage("工单已记录。")],
			{ store },
		);
		const result = await test.run({ permissions: ["tickets:write"] });
		expect(result.type).toBe("answer");
		expect(store.getTickets()).toHaveLength(1);
		expect(result.evidence).toEqual([]);
	});
	it("does not retry a failed required check through the model", async () => {
		let calls = 0;
		const test = setup(
			[],
			[tool("search_knowledge", { query: "original ordinary request" }), fauxAssistantMessage("prose")],
			{
				retrieval: {
					search: async () => {
						calls++;
						throw new Error("read failed");
					},
				},
			},
		);
		const result = await test.run();
		expect(result.type).toBe("fallback");
		expect(calls).toBe(1);
		expect(result.sessionEvents.some((e) => e.type === "tool_execution_start")).toBe(false);
	});
	it.each(["retired", "unapproved", "synthetic_test_only"] as const)(
		"rejects %s evidence in the policy check",
		async (status) => {
			const raw = entry();
			raw.knowledge!.status = status;
			const test = setup([raw]);
			const result = await test.run();
			expect(result.type).toBe("fallback");
			expect(result.evidence).toEqual([]);
		},
	);
	it("an admitted FAQ uses its unchanged direct path without policy ordinary retrieval", async () => {
		const test = setup(
			[],
			[tool("search_faq", { query: "original ordinary request" }), fauxAssistantMessage("prose")],
			{
				faq: [
					{
						id: "faq",
						question: "ordinary request",
						answer: "FAQ_CANONICAL",
						status: "approved",
						version: "v1",
						sourceRef: "test://faq",
					},
				],
			},
		);
		const result = await test.run();
		expect(result.type).toBe("answer");
		expect(result.text).toBe("FAQ_CANONICAL");
		expect(test.calls).toEqual([]);
	});
	it("different later zero result prevents resurrecting an older single", async () => {
		const test = setup([], [tool("search_knowledge", { query: "later" }), fauxAssistantMessage("prose")], {
			retrieval: { search: async (q) => (q === "later" ? [] : [entry()]) },
		});
		const result = await test.run();
		expect(result.type).toBe("fallback");
		expect(result.evidence).toEqual([]);
	});
	it("a revoked source cannot survive the finalization deadline", async () => {
		const raw = entry();
		const test = setup([raw], undefined, {
			streamFn: () => {
				raw.knowledge!.status = "retired";
				return hangingStream();
			},
			limits: { overallTurnTimeoutMs: 20 },
		});
		const result = await test.run();
		expect(result.type).toBe("fallback");
		expect(result.evidence).toEqual([]);
	});
	it("zero tool budget blocks the policy operation before retrieval", async () => {
		const test = setup([entry()], undefined, { limits: { maxToolCalls: 0 } });
		const result = await test.run();
		expect(result.type).toBe("fallback");
		expect(test.calls).toEqual([]);
		expect(test.audit()).toMatchObject({ limitReached: true });
	});
	it("a later failing read overrides an admitted policy result", async () => {
		const test = setup([], [tool("search_knowledge", { query: "later" })], {
			retrieval: {
				search: async (q) => {
					if (q === "later") throw new Error("read failed");
					return [entry()];
				},
			},
		});
		const result = await test.run();
		expect(result.type).toBe("fallback");
		expect(result.evidence).toEqual([]);
		expect(test.audit()).toMatchObject({ toolFailed: true, grounding: { evidence: [] } });
	});
	it("mandatory escalation cannot be converted to an ordinary deadline answer", async () => {
		const test = setup([entry()], undefined, {
			streamFn: () => hangingStream(),
			limits: { overallTurnTimeoutMs: 20 },
		});
		const result = await test.run({ requiresEscalation: true });
		expect(result.type).toBe("fallback");
		expect(result.evidence).toEqual([]);
	});
	it("a failed durable write wins over settled policy evidence", async () => {
		const test = setup([entry()], [tool("create_ticket", { summary: "test", idempotencyKey: "key" })], {
			businessStore: {
				findTicket: async () => undefined,
				findHandoff: async () => undefined,
				createTicket: async () => {
					throw new Error("write failed");
				},
				createHandoff: async () => {
					throw new Error("unused");
				},
				recordAudit: async () => {},
			},
		});
		const result = await test.run({ permissions: ["tickets:write"] });
		expect(result.type).toBe("fallback");
		expect(result.evidence).toEqual([]);
		expect(test.audit()).toMatchObject({ toolFailed: true });
	});
	it("an in-flight durable write cannot be finalized as an evidence answer", async () => {
		let rejectWrite: (reason: Error) => void = () => {};
		const test = setup([entry()], [tool("create_ticket", { summary: "test", idempotencyKey: "key" })], {
			limits: { overallTurnTimeoutMs: 30 },
			businessStore: {
				findTicket: async () => undefined,
				findHandoff: async () => undefined,
				createTicket: () =>
					new Promise((_resolve, reject) => {
						rejectWrite = reject;
					}),
				createHandoff: async () => {
					throw new Error("unused");
				},
				recordAudit: async () => {},
			},
		});
		const result = await test.run({ permissions: ["tickets:write"] });
		const before = JSON.stringify(result);
		expect(result.type).toBe("fallback");
		rejectWrite(new Error("late write failure"));
		await new Promise((resolve) => setTimeout(resolve, 5));
		expect(JSON.stringify(result)).toBe(before);
	});
	it("Agent turn limit still overrides an admitted snapshot", async () => {
		const test = setup([entry()], [tool("search_knowledge", { query: "original ordinary request" })], {
			limits: { maxAgentTurns: 1 },
		});
		const result = await test.run();
		expect(result.type).toBe("fallback");
		expect(test.audit()).toMatchObject({ limitReached: true });
	});
	it("scoped prechecks reject foreign tenant and store before authorization", async () => {
		for (const scope of [{ tenantScope: "tenant-b" }, { tenantScope: "tenant-a", storeScope: "store-b" }]) {
			const evidence = entry();
			Object.assign(evidence.knowledge!, scope);
			const test = setup([evidence]);
			const result = await test.run();
			expect(result.type).toBe("fallback");
			expect(result.evidence).toEqual([]);
		}
	});
	it("strict Pi tool schema cannot bypass fail-closed through a cached query", async () => {
		const test = setup([entry()], [tool("search_knowledge", { query: "original ordinary request", bypass: true })]);
		const result = await test.run();
		expect(result.type).toBe("fallback");
		expect(test.calls).toHaveLength(1);
		expect(test.audit()).toMatchObject({ toolFailed: true });
	});
	it("a per-tool deadline cancels the policy read and cannot be hidden by provider prose", async () => {
		let signal: AbortSignal | undefined;
		const test = setup([], undefined, {
			limits: { perToolTimeoutMs: 10 },
			retrieval: {
				search: (_q, s) =>
					new Promise((resolve) => {
						signal = s;
						s.addEventListener("abort", () => resolve([]), { once: true });
					}),
			},
		});
		const result = await test.run();
		expect(result.type).toBe("fallback");
		expect(signal?.aborted).toBe(true);
		expect(test.audit()).toMatchObject({ toolFailed: true, policyStoppedBeforePi: true });
	});
});
