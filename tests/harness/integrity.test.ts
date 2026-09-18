import { describe, expect, it, vi } from "vitest";
import { hashPopulation } from "../../evals/job-ready-rag/freeze.ts";
import type { RunConfig } from "../../harness/contracts.ts";
import { evaluateRun } from "../../harness/evaluate.ts";
import { runSuite } from "../../harness/runner.ts";
import { declareRun } from "../../harness/suites.ts";
import { createSupportExecutionContext } from "../../src/enterprise/identity.ts";
import type { SupportResult } from "../../src/index.ts";

function fixture() {
	const context = createSupportExecutionContext(
		{
			id: "fixture-member",
			userId: "fixture-user",
			tenantId: "fixture-tenant",
			storeId: "fixture-store",
			role: "agent",
			createdAt: new Date("2026-09-01T00:00:00Z"),
		},
		"fixture-request",
	);
	const suite = {
		suiteId: "integrity-fixture-v1",
		cases: ["A", "B", "C"].map((caseId) => ({
			caseId,
			context,
			input: { conversationId: `fixture-${caseId}`, customerId: "fixture-customer", text: "fixture query" },
		})),
	};
	const config: RunConfig = {
		sourceCommit: "unknown",
		sourceTree: "unknown",
		runtimeMode: "deterministic",
		provider: "unknown",
		model: "unknown",
		retrievalStrategy: "fake",
		embeddingProfile: null,
		limits: { maxAgentTurns: 4, maxToolCalls: 6, overallTurnTimeoutMs: 10000, perToolTimeoutMs: 2000 },
		toolExecution: "sequential",
	};
	const inputs = { suite, config, corpus: null };
	const declaration = declareRun("fixture-run", inputs);
	const result: SupportResult = {
		type: "answer",
		text: "PRIVATE_ANSWER",
		piSessionId: "PRIVATE_SESSION",
		sessionEvents: [],
		toolsCalled: ["search_knowledge"],
		evidence: [{ id: "actual-entry", version: "actual-v1", sourceRef: "test://actual-source", kind: "policy" }],
	};
	const service = { respond: vi.fn(async () => structuredClone(result)) };
	return { inputs, declaration, service };
}

describe("Thin Harness integrity", () => {
	it("verifies an intact completed run without asserting quality PASS", async () => {
		const f = fixture();
		const { run, receipt } = await runSuite(f.declaration, f.inputs, f.service);
		expect(evaluateRun(run, f.declaration, receipt)).toEqual({
			integrity: "verified",
			completionState: "complete",
			issues: [],
			quality: "not_evaluated",
		});
	});

	it("NC-1 rejects a missing expected case", async () => {
		const f = fixture();
		const { run, receipt } = await runSuite(f.declaration, f.inputs, f.service);
		run.measurements.pop();
		const evaluation = evaluateRun(run, f.declaration, receipt);
		expect(evaluation.completionState).toBe("incomplete");
		expect(evaluation.issues).toContain("case_population_mismatch");
	});

	it("NC-2 rejects duplicate measurements and duplicate suite IDs before dispatch", async () => {
		const f = fixture();
		const { run, receipt } = await runSuite(f.declaration, f.inputs, f.service);
		run.measurements[2] = structuredClone(run.measurements[1]);
		expect(evaluateRun(run, f.declaration, receipt).issues).toContain("duplicate_case");
		f.inputs.suite.cases[2] = structuredClone(f.inputs.suite.cases[1]);
		f.service.respond.mockClear();
		await expect(runSuite(f.declaration, f.inputs, f.service)).rejects.toThrow("duplicate_case");
		expect(f.service.respond).not.toHaveBeenCalled();
	});

	it.each(["config", "suite", "corpus"] as const)("NC-3 rejects %s input drift before dispatch", async (field) => {
		const f = fixture();
		if (field === "config") f.inputs.config.model = "different-fixture";
		if (field === "suite") f.inputs.suite.cases[0].input.text = "different query";
		const inputs = field === "corpus" ? { ...f.inputs, corpus: [] } : f.inputs;
		await expect(runSuite(f.declaration, inputs, f.service)).rejects.toThrow("declaration_mismatch");
		expect(f.service.respond).not.toHaveBeenCalled();
	});

	it.each(["configHash", "suiteHash", "corpusHash"] as const)(
		"NC-3 rejects a changed %s in the report",
		async (field) => {
			const f = fixture();
			const { run, receipt } = await runSuite(f.declaration, f.inputs, f.service);
			run.declaration[field] = "f".repeat(64);
			expect(evaluateRun(run, f.declaration, receipt).issues).toContain("declaration_mismatch");
		},
	);

	it.each(["version", "sourceRef"] as const)("NC-4 detects actual evidence %s tampering", async (field) => {
		const f = fixture();
		const { run, receipt } = await runSuite(f.declaration, f.inputs, f.service);
		const measurement = run.measurements[0];
		if (measurement.finalResult === "execution_error") throw new Error("Expected returned fixture.");
		measurement.evidence[0][field] = "tampered";
		// Even refreshing the report's own marker cannot replace the separately retained receipt.
		run.completionMarker = { measurementHash: hashPopulation(run.measurements) };
		const evaluation = evaluateRun(run, f.declaration, receipt);
		expect(evaluation.integrity).toBe("failed");
		expect(evaluation.issues).toContain("receipt_mismatch");
		expect(evaluation.completionState).toBe("incomplete");
	});

	it("NC-5 rejects a complete claim without an execution completion marker", async () => {
		const f = fixture();
		const { run, receipt } = await runSuite(f.declaration, f.inputs, f.service);
		run.completionMarker = null;
		expect(evaluateRun(run, f.declaration, receipt).issues).toContain("completion_marker_missing");
	});

	it("NC-5 cannot promote an interrupted run by relabelling it complete", async () => {
		const f = fixture();
		const controller = new AbortController();
		f.service.respond.mockImplementationOnce(async () => {
			controller.abort();
			return {
				type: "fallback",
				text: "",
				piSessionId: "fixture",
				evidence: [],
				toolsCalled: [],
				sessionEvents: [],
			};
		});
		const { run, receipt } = await runSuite(f.declaration, f.inputs, f.service, controller.signal);
		expect(run.completionState).toBe("incomplete");
		expect(run.measurements).toHaveLength(1);
		run.completionState = "complete";
		const evaluation = evaluateRun(run, f.declaration, receipt);
		expect(evaluation.completionState).toBe("incomplete");
		expect(evaluation.issues).toContain("completion_marker_missing");
	});

	it("rejects case reordering, unexpected cases and changed run identity", async () => {
		const f = fixture();
		const output = await runSuite(f.declaration, f.inputs, f.service);
		const reordered = structuredClone(output.run);
		reordered.measurements.reverse();
		expect(evaluateRun(reordered, f.declaration, output.receipt).issues).toContain("case_population_mismatch");
		const unexpected = structuredClone(output.run);
		unexpected.measurements[0].caseId = "not-declared";
		expect(evaluateRun(unexpected, f.declaration, output.receipt).completionState).toBe("incomplete");
		output.run.declaration.runId = "another-run";
		expect(evaluateRun(output.run, f.declaration, output.receipt).issues).toContain("declaration_mismatch");
	});

	it("rejects an empty population and non-S1 configuration", () => {
		const f = fixture();
		expect(() => declareRun("empty", { ...f.inputs, suite: { suiteId: "empty", cases: [] } })).toThrow("empty_suite");
		f.inputs.config.limits.maxToolCalls = 7;
		expect(() => declareRun("limits", f.inputs)).toThrow("unsupported_s1_config");
	});

	it("never exports query, answer, context, raw events or raw error text", async () => {
		const f = fixture();
		const output = await runSuite(f.declaration, f.inputs, f.service);
		expect(JSON.stringify(output)).not.toMatch(/PRIVATE_|fixture query|fixture-customer|fixture-user|sessionEvents/);
		f.service.respond.mockRejectedValueOnce(new Error("SECRET_TOKEN_AND_SQL"));
		expect(JSON.stringify(await runSuite(f.declaration, f.inputs, f.service))).not.toContain("SECRET_TOKEN_AND_SQL");
	});
});
