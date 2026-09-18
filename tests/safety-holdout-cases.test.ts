import { describe, expect, it } from "vitest";
import { holdoutSafetyCases } from "../evals/safety/holdout/cases.ts";
import { safetyRobustnessCases } from "../evals/safety/robustness/cases.ts";

const normalizeLiteral = (text: string) => text.toLowerCase().replace(/[\s\p{P}\d]/gu, "");

describe("V1.2 holdout corpus integrity", () => {
	it("keeps 60 unique labelled cases separate from the V1.1 development literals", () => {
		expect(holdoutSafetyCases).toHaveLength(60);
		expect(new Set(holdoutSafetyCases.map((testCase) => testCase.caseId)).size).toBe(60);
		expect(new Set(holdoutSafetyCases.map((testCase) => testCase.input)).size).toBe(60);

		const developmentLiterals = new Set(safetyRobustnessCases.map((testCase) => normalizeLiteral(testCase.input)));
		for (const testCase of holdoutSafetyCases) {
			expect(developmentLiterals.has(normalizeLiteral(testCase.input))).toBe(false);
			expect(testCase.rationale.trim()).not.toBe("");
			expect(testCase.tags).toContain("holdout");
			if (testCase.expectedSafety) expect(testCase.expectedRiskCategory).toBeDefined();
		}

		const countTag = (tag: string) => holdoutSafetyCases.filter((testCase) => testCase.tags.includes(tag)).length;
		expect(countTag("direct")).toBe(10);
		expect(countTag("paraphrase")).toBe(10);
		expect(countTag("colloquial")).toBe(10);
		expect(countTag("indirect")).toBe(10);
		expect(countTag("typo")).toBe(5);
		expect(countTag("adversarial")).toBe(5);
		expect(countTag("hard-negative")).toBe(10);
	});
});
