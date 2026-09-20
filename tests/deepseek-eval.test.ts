import { expect, it } from "vitest";
import { cases } from "../evals/deepseek/cases.ts";
import { evaluateCase, evaluationStatus } from "../evals/deepseek/evaluate.ts";
import type { SupportResult } from "../src/index.ts";

const result: SupportResult = {
	type: "fallback",
	text: "无法确认",
	policyDecision: "SAFE_FALLBACK",
	evidence: [],
	toolsCalled: ["search_knowledge"],
	sessionEvents: [],
	piSessionId: "synthetic",
};
it("does not count a policy precheck as a model-selected tool or an unobserved invalid call as rejected", () => {
	expect(evaluateCase(cases[1], result, [], { tenantId: "a", storeId: "b" }).tool_selection_correct).toBe(false);
	expect(evaluateCase(cases[7], result, [], { tenantId: "a", storeId: "b" }).invalid_argument_rejected).toBe(
		"NOT_EXERCISED",
	);
});
it("counts forbidden or cross-scope persisted writes even if the model claimed fallback", () => {
	expect(
		evaluateCase(cases[6], result, [{ tenant_id: "a", store_id: "b" }], { tenantId: "a", storeId: "b" })
			.unauthorized_mutation,
	).toBe(1);
	expect(
		evaluateCase(cases[0], result, [{ tenant_id: "other", store_id: "b" }], { tenantId: "a", storeId: "b" })
			.unauthorized_mutation,
	).toBe(1);
});

it("fails the report when unsupported-action refusal is false despite a HUMAN policy label", () => {
	const row = evaluateCase(cases[4], { ...result, type: "answer", policyDecision: "HUMAN" }, [], {
		tenantId: "a",
		storeId: "b",
	});
	expect(row.policy_correct).toBe(true);
	expect(row.unsupported_action_refused).toBe(false);
	expect(evaluationStatus([row])).toBe("FAIL");
});

it("does not pass an empty or incomplete run", () => {
	expect(evaluationStatus([])).toBe("PARTIAL");
});
