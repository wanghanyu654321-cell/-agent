import { describe, expect, it } from "vitest";
import {
	FUTURE_GATE,
	holdoutHash,
	loadHoldout,
	reverseHoldoutCase,
	validateHoldout,
} from "../evals/selection/semantic/holdout-v1/holdout.ts";

describe("unseen holdout v1", () => {
	it("freezes 24 direct-and-sufficient positives and six hard abstains", () => {
		const cases = loadHoldout();
		expect(() => validateHoldout(cases)).not.toThrow();
		expect(cases).toHaveLength(30);
		expect(cases.filter((item) => item.expectedSelection !== "ABSTAIN")).toHaveLength(24);
		expect(cases.filter((item) => item.expectedSelection === "ABSTAIN")).toHaveLength(6);
		expect(
			cases.every((item) => item.goldDirectness === (item.expectedSelection === "ABSTAIN" ? "partial" : "direct")),
		).toBe(true);
		expect(
			cases.every(
				(item) => item.goldSufficiency === (item.expectedSelection === "ABSTAIN" ? "insufficient" : "sufficient"),
			),
		).toBe(true);
		expect(cases.every((item) => item.requiresUnsupportedInference === (item.expectedSelection === "ABSTAIN"))).toBe(
			true,
		);
	});

	it("preserves evidence identity and abstain semantics through deterministic reversal", () => {
		const cases = loadHoldout();
		for (const item of cases) {
			const reversed = reverseHoldoutCase(item);
			expect(reversed.query).toBe(item.query);
			expect(reversed.expectedSelection).toBe(item.expectedSelection);
			expect(new Set(reversed.candidateEvidenceIds)).toEqual(new Set(item.candidateEvidenceIds));
			expect(reversed.candidateEvidenceIds).not.toEqual(item.candidateEvidenceIds);
		}
		expect(holdoutHash()).toMatch(/^[a-f0-9]{64}$/);
		expect(FUTURE_GATE).toMatchObject({
			futurePrimaryCalls: 30,
			futureReversedCalls: 30,
			futureTotalCalls: 60,
			wrong: 0,
			invalid: 0,
			providerError: 0,
			timeout: 0,
			orderInducedWrong: 0,
			orderInducedOutcomeDisagreement: 0,
		});
	});
});
