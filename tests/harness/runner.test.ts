import { fauxAssistantMessage, registerFauxProvider, streamSimple } from "@earendil-works/pi-ai/compat";
import { describe, expect, it, vi } from "vitest";
import type { HarnessSuite, RunConfig } from "../../harness/contracts.ts";
import { evaluateRun } from "../../harness/evaluate.ts";
import { runSuite } from "../../harness/runner.ts";
import { declareRun } from "../../harness/suites.ts";
import { type EnterpriseBusinessRepository, EnterpriseSupportService } from "../../src/enterprise/business.ts";
import { createSupportExecutionContext } from "../../src/enterprise/identity.ts";
import {
	InMemorySupportStore,
	type RetrievalEvidence,
	SupportAgentRuntime,
	type SupportRequest,
	type SupportResult,
} from "../../src/index.ts";

function inputs(): { suite: HarnessSuite; config: RunConfig; corpus: null } {
	const context = createSupportExecutionContext(
		{
			id: "fixture-member",
			userId: "fixture-user",
			tenantId: "tenant-a",
			storeId: "store-a",
			role: "agent",
			createdAt: new Date("2026-09-01T00:00:00Z"),
		},
		"fixture-request",
	);
	return {
		suite: {
			suiteId: "runtime-fixture-v1",
			cases: ["zero", "one", "many"].map((caseId) => ({
				caseId,
				context: structuredClone(context),
				input: { conversationId: `fixture-${caseId}`, customerId: "customer-a", text: caseId },
			})),
		},
		config: {
			sourceCommit: "unknown",
			sourceTree: "unknown",
			runtimeMode: "deterministic",
			provider: "unknown",
			model: "unknown",
			retrievalStrategy: "fake",
			embeddingProfile: null,
			toolExecution: "sequential",
			limits: { maxAgentTurns: 4, maxToolCalls: 6, overallTurnTimeoutMs: 10000, perToolTimeoutMs: 2000 },
		},
		corpus: null,
	};
}

function returned(type: SupportResult["type"] = "fallback"): SupportResult {
	return { type, text: "fixture", piSessionId: "fixture-session", evidence: [], toolsCalled: [], sessionEvents: [] };
}

// Test fixture below the real enterprise service. No SQL or durable-write claim.
function repository(): EnterpriseBusinessRepository {
	return {
		findConversationById: async () => undefined,
		createConversation: async (conversation) => conversation,
		setConversationPiSession: async () => {},
		listConversations: async () => [],
		listTickets: async () => [],
		listHandoffs: async () => [],
		listAuditEvents: async () => [],
		findTicket: async () => undefined,
		findHandoff: async () => undefined,
		createTicket: async () => {
			throw new Error("Unexpected business operation.");
		},
		createHandoff: async () => {
			throw new Error("Unexpected business operation.");
		},
		recordAudit: async () => {},
	};
}

describe("Thin Harness runner", () => {
	it("executes in declared order with one in-flight service call and detached inputs/results", async () => {
		const data = inputs();
		const declaration = declareRun("order-fixture", data);
		let active = 0;
		let maximum = 0;
		const seen: string[] = [];
		const sharedResult = returned();
		const service = {
			respond: vi.fn(async (context, input) => {
				active += 1;
				maximum = Math.max(maximum, active);
				seen.push(input.text);
				context.scope.tenantId = "mutated-by-service";
				await Promise.resolve();
				active -= 1;
				return sharedResult;
			}),
		};
		const { run, receipt } = await runSuite(declaration, data, service);
		sharedResult.toolsCalled.push("late-mutation");
		expect(seen).toEqual(["zero", "one", "many"]);
		expect(maximum).toBe(1);
		expect(data.suite.cases[0].context.scope.tenantId).toBe("tenant-a");
		expect(run.measurements.map((m) => m.attemptedOperations)).toEqual([[], [], []]);
		expect(evaluateRun(run, declaration, receipt).completionState).toBe("complete");
	});

	it("NC-6 preserves a thrown service error separately from a returned empty fallback", async () => {
		const data = inputs();
		const declaration = declareRun("error-fixture", data);
		const service = {
			respond: vi.fn().mockResolvedValueOnce(returned()).mockRejectedValueOnce(new Error("private failure")),
		};
		const { run, receipt } = await runSuite(declaration, data, service);
		expect(run.measurements).toEqual([
			{
				caseId: "zero",
				finalResult: "fallback",
				evidence: [],
				attemptedOperations: [],
				retrievalStatus: "unverified",
			},
			{
				caseId: "one",
				finalResult: "execution_error",
				evidence: null,
				attemptedOperations: null,
				retrievalStatus: "unverified",
				errorCategory: "service_error",
			},
		]);
		expect(service.respond).toHaveBeenCalledTimes(2);
		expect(run.completionMarker).toBeNull();
		expect(evaluateRun(run, declaration, receipt).completionState).toBe("incomplete");
	});

	it("NC-5 retains no fabricated measurements when cancelled before dispatch", async () => {
		const data = inputs();
		const declaration = declareRun("cancel-fixture", data);
		const service = { respond: vi.fn(async () => returned()) };
		const { run } = await runSuite(declaration, data, service, AbortSignal.abort());
		expect(run.measurements).toEqual([]);
		expect(run.completionState).toBe("incomplete");
		expect(service.respond).not.toHaveBeenCalled();
	});

	it("isolates shared case contexts from service mutation", async () => {
		const data = inputs();
		data.suite.cases[1].context = data.suite.cases[0].context;
		const observed: string[] = [];
		const service = {
			respond: vi.fn(async (context) => {
				observed.push(context.scope.tenantId);
				context.scope.tenantId = "changed";
				return returned();
			}),
		};
		await runSuite(declareRun("alias-fixture", data), data, service);
		expect(observed).toEqual(["tenant-a", "tenant-a", "tenant-a"]);
	});

	it.each(["abort", "throw"])("cannot complete when the last expected case ends with %s", async (ending) => {
		const data = inputs();
		data.suite.cases = data.suite.cases.slice(0, 1);
		const controller = new AbortController();
		const service = {
			respond: async () => {
				if (ending === "throw") throw new Error("fixture");
				controller.abort();
				return returned();
			},
		};
		const declaration = declareRun("last-case-fixture", data);
		const { run, receipt } = await runSuite(declaration, data, service, controller.signal);
		expect(run.measurements).toHaveLength(1);
		expect(run.completionMarker).toBeNull();
		expect(evaluateRun(run, declaration, receipt).completionState).toBe("incomplete");
	});

	it.each(["version", "sourceRef"] as const)(
		"never backfills a missing returned %s from corpus metadata",
		async (field) => {
			const data = inputs();
			const knownCorpus = [
				{
					id: "entry",
					kind: "policy" as const,
					status: "synthetic_test_only" as const,
					title: "test fixture",
					content: "PRIVATE_CORPUS_BODY",
					tags: [],
					version: "fixture-v1",
					sourceRef: "test://entry",
					updatedAt: "2026-09-01",
				},
			];
			const knownInputs = { ...data, corpus: knownCorpus };
			const result = returned("answer");
			result.evidence = [{ id: "entry", kind: "policy", version: "fixture-v1", sourceRef: "test://entry" }];
			Reflect.deleteProperty(result.evidence[0], field);
			const { run } = await runSuite(declareRun("missing-reference", knownInputs), knownInputs, {
				respond: async () => result,
			});
			expect(run.measurements[0]).toMatchObject({ finalResult: "execution_error", evidence: null });
			expect(run.completionState).toBe("incomplete");
			expect(run.declaration.corpusHash).toMatch(/^[a-f0-9]{64}$/);
			expect(JSON.stringify(run)).not.toContain("PRIVATE_CORPUS_BODY");
		},
	);

	it("preserves an actual escalation without interpreting its operations as durable success", async () => {
		const data = inputs();
		data.suite.cases = data.suite.cases.slice(0, 1);
		const result = returned("escalation");
		result.toolsCalled = ["handoff_to_human"];
		const { run } = await runSuite(declareRun("escalation-fixture", data), data, { respond: async () => result });
		expect(run.measurements[0]).toEqual({
			caseId: "zero",
			finalResult: "escalation",
			evidence: [],
			attemptedOperations: ["handoff_to_human"],
			retrievalStatus: "unverified",
		});
	});

	it("uses the real Enterprise service and Pi Runtime for 0/1/2+ evidence; NC-7 policy attempts are not Pi events", async () => {
		const faux = registerFauxProvider();
		const data = inputs();
		data.config.provider = faux.getModel().provider;
		data.config.model = faux.getModel().id;
		const evidence = (id: string): RetrievalEvidence => ({
			id,
			text: "synthetic test policy",
			knowledge: { kind: "policy", status: "synthetic_test_only", version: "fixture-v1", sourceRef: `test://${id}` },
		});
		const requests: SupportRequest[] = [];
		const actual: SupportResult[] = [];
		const runtime = new SupportAgentRuntime({
			model: faux.getModel(),
			streamFn: streamSimple,
			store: new InMemorySupportStore(),
			faq: [],
			allowSyntheticTestKnowledge: true,
			retrieval: {
				search: async (query) =>
					query === "one" ? [evidence("one")] : query === "many" ? [evidence("first"), evidence("second")] : [],
			},
		});
		const service = new EnterpriseSupportService({
			repository: repository(),
			runtime: {
				async run(request) {
					requests.push(structuredClone(request));
					faux.setResponses([fauxAssistantMessage("untrusted faux completion")]);
					const result = await runtime.run(request);
					actual.push(result);
					return result;
				},
			},
		});
		try {
			const declaration = declareRun("real-boundary-fixture", data);
			const { run, receipt } = await runSuite(declaration, data, service);
			expect(run.measurements.map((m) => m.finalResult)).toEqual(["fallback", "answer", "fallback"]);
			expect(run.measurements.map((m) => m.evidence)).toEqual(actual.map((r) => r.evidence));
			expect(run.measurements[1].evidence).toEqual([
				{ id: "one", kind: "policy", version: "fixture-v1", sourceRef: "test://one" },
			]);
			expect(run.measurements[0].attemptedOperations).toEqual(["search_knowledge"]);
			expect(actual[0].sessionEvents.filter((e) => e.type === "tool_execution_start")).toEqual([]);
			expect(JSON.stringify(run)).not.toMatch(/piToolEvents|agentToolEvents|sessionEvents/);
			expect(
				requests.every(
					(r) => r.tenantId === "tenant-a" && r.storeId === "store-a" && r.customerId === "customer-a",
				),
			).toBe(true);
			expect(requests[0].permissions).toEqual(["tickets:write"]);
			expect(requests[0].mayEscalate).toBe(false);
			expect(evaluateRun(run, declaration, receipt).completionState).toBe("complete");
		} finally {
			faux.unregister();
		}
	});

	it("NC-6 does not score a Runtime-caught retrieval error as successful empty retrieval", async () => {
		const faux = registerFauxProvider();
		const data = inputs();
		data.suite.cases = data.suite.cases.slice(0, 1);
		const retrieval = {
			search: vi.fn(async () => {
				throw new Error("fixture retrieval unavailable");
			}),
		};
		const runtime = new SupportAgentRuntime({
			model: faux.getModel(),
			streamFn: streamSimple,
			store: new InMemorySupportStore(),
			faq: [],
			retrieval,
		});
		const service = new EnterpriseSupportService({ repository: repository(), runtime });
		try {
			const declaration = declareRun("caught-error-fixture", data);
			const { run, receipt } = await runSuite(declaration, data, service);
			expect(retrieval.search).toHaveBeenCalledOnce();
			expect(run.measurements[0]).toMatchObject({
				finalResult: "fallback",
				evidence: [],
				retrievalStatus: "unverified",
			});
			expect(evaluateRun(run, declaration, receipt).quality).toBe("not_evaluated");
			expect(run.measurements[0]).not.toHaveProperty("success");
		} finally {
			faux.unregister();
		}
	});
});
