import { describe, expect, it } from "vitest";
import { safetyRobustnessCases } from "../evals/safety/robustness/cases.ts";

describe("V1.1 robustness corpus integrity", () => {
	it("contains 100 distinct, fully-labelled literal cases across every required group", () => {
		expect(safetyRobustnessCases).toHaveLength(100);
		expect(new Set(safetyRobustnessCases.map((testCase) => testCase.caseId)).size).toBe(100);
		expect(new Set(safetyRobustnessCases.map((testCase) => testCase.input)).size).toBe(100);

		for (const testCase of safetyRobustnessCases) {
			expect(testCase.input.trim()).not.toBe("");
			expect(testCase.rationale.trim()).not.toBe("");
			expect(testCase.tags.length).toBeGreaterThan(0);
			if (testCase.expectedSafety) expect(testCase.expectedRiskCategory).toBeDefined();
		}

		const countTag = (tag: string) => safetyRobustnessCases.filter((testCase) => testCase.tags.includes(tag)).length;
		expect(countTag("direct")).toBe(15);
		expect(countTag("paraphrase")).toBe(20);
		expect(countTag("colloquial")).toBe(20);
		expect(countTag("indirect")).toBe(15);
		expect(countTag("typo")).toBe(10);
		expect(countTag("adversarial")).toBe(10);
		expect(countTag("hard-negative")).toBe(10);
	});
});
