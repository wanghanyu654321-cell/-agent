import { describe, expect, it } from "vitest";
import { knowledgeEvalCases } from "../evals/knowledge/cases.ts";
import {
	evaluateKnowledgeCase,
	evaluateKnowledgeObservation,
	isKnowledgeGatePassed,
} from "../evals/knowledge/runner.ts";

describe("V2.0 governed knowledge evaluation", () => {
	it("contains at least forty controlled cases across admission, scope, grounding, and adversarial groups", () => {
		expect(knowledgeEvalCases.length).toBeGreaterThanOrEqual(40);
		expect(new Set(knowledgeEvalCases.map((testCase) => testCase.caseId)).size).toBe(knowledgeEvalCases.length);
		for (const required of [
			"faq",
			"policy",
			"sop",
			"no-evidence",
			"unapproved",
			"synthetic",
			"retired",
			"tenant",
			"store",
			"injection",
			"invented",
			"citation",
		]) {
			expect(knowledgeEvalCases.some((testCase) => testCase.tags.includes(required))).toBe(true);
		}
	});

	it("negative controls make fabricated admission, scope leaks, wrong trace, and invented answers fail the evaluator", () => {
		const testCase = knowledgeEvalCases.find((item) => item.mode === "admissible" && item.kind === "policy")!;
		expect(
			evaluateKnowledgeObservation(testCase, {
				actualType: "answer",
				actualText: "模型虚构业务事实。",
				actualEvidence: [],
				auditEvidence: [],
				actualToolCalls: ["search_knowledge"],
			}).failureReasons,
		).toContain("unsupported_business_fact");
		for (const mode of ["unapproved", "tenant_mismatch"] as const) {
			const rejectedCase = knowledgeEvalCases.find((item) => item.mode === mode)!;
			expect(
				evaluateKnowledgeObservation(rejectedCase, {
					actualType: "answer",
					actualText: "fabricated admission",
					actualEvidence: [],
					auditEvidence: [],
					actualToolCalls: ["search_knowledge"],
				}).pass,
			).toBe(false);
		}
		expect(
			evaluateKnowledgeObservation(testCase, {
				actualType: "answer",
				actualText: "controlled answer",
				actualEvidence: [{ id: "wrong-id", version: "wrong-version", sourceRef: "test://wrong", kind: "policy" }],
				auditEvidence: [{ id: "wrong-id", version: "wrong-version", sourceRef: "test://wrong", kind: "policy" }],
				actualToolCalls: ["search_knowledge"],
			}).failureReasons,
		).toEqual(expect.arrayContaining(["evidence_id_mismatch", "evidence_version_mismatch"]));
		expect(
			isKnowledgeGatePassed({
				passRate: 1,
				approvedEvidenceUsageRate: 1,
				unapprovedEvidenceAcceptanceRate: 1,
				syntheticProductionEvidenceAcceptanceRate: 0,
				retiredEvidenceAcceptanceRate: 0,
				crossTenantLeakageRate: 0,
				crossStoreLeakageRate: 0,
				unsupportedBusinessFactRate: 0,
				evidenceTraceAccuracy: 1,
				evidenceVersionTraceAccuracy: 1,
				noEvidenceFailClosedRate: 1,
			}),
		).toBe(false);
	});

	it("executes the real SupportAgentRuntime and reads persisted audit evidence", async () => {
		const testCase = knowledgeEvalCases.find((item) => item.mode === "admissible" && item.kind === "policy")!;
		const result = await evaluateKnowledgeCase(testCase);

		expect(result.actualToolCalls).toEqual(["search_knowledge"]);
		expect(result.actualEvidence).toHaveLength(1);
		expect(result.auditEvidence).toEqual(result.actualEvidence);
		expect(result.pass).toBe(true);
	});
});
