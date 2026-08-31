import { describe, expect, it } from "vitest";
import type { PersistedSemanticInvocationTrace } from "../evals/selection/semantic/evaluation.ts";
import {
	assertFinalV231FrozenConfiguration,
	buildFinalV231EvaluationCases,
	FINAL_V231_EXPECTED_SEMANTIC_CALLS,
	FINAL_V231_FROZEN_HOLDOUT_COMMIT,
	summarizeFinalV231Segments,
} from "../evals/selection/semantic/run-final-v2-3-1-true-unseen-gate.ts";

describe("final V2.3.1 true unseen Gate runner", () => {
	it("builds the exact frozen 12-primary / 24-invocation population without runtime admission", () => {
		const population = buildFinalV231EvaluationCases();

		expect(population.cases).toHaveLength(12);
		expect(population.evidenceHash).toBe("7a17e6496da4d4e0019781d2f2ec624b660cf445bc5a174b599e5a17be7bf01d");
		expect(population.casesHash).toBe("9e7ada4c9117c575dd265c81223e7b1f229305fd704686f19cee09f30ab9b118");
		expect(population.boundaryByCase.get("final-v2.3.1-01")).toBe("CLEAR_DIRECT_ANSWER");
		expect(population.boundaryByCase.get("final-v2.3.1-05")).toBe("TRUE_INSUFFICIENCY");
		expect(population.boundaryByCase.get("final-v2.3.1-09")).toBe("HARD_RELATED_INSUFFICIENT");
		expect(FINAL_V231_EXPECTED_SEMANTIC_CALLS).toBe(24);
	});

	it("rejects altered provider, model, prompt, hashes, or missing frozen Holdout ancestry before a call", () => {
		expect(() =>
			assertFinalV231FrozenConfiguration({
				provider: "wrong-provider",
				model: "gpt-5.6-sol",
				sourceCommit: FINAL_V231_FROZEN_HOLDOUT_COMMIT,
				isAncestor: () => true,
			}),
		).toThrow("frozen provider/model");
		expect(() =>
			assertFinalV231FrozenConfiguration({
				provider: "openai-codex",
				model: "gpt-5.6-sol",
				sourceCommit: "different-commit",
				isAncestor: () => false,
			}),
		).toThrow("ancestry");
	});

	it("derives Group A/B/C primary and reverse outcomes from traces rather than handwritten counts", () => {
		const population = buildFinalV231EvaluationCases();
		const traces: PersistedSemanticInvocationTrace[] = population.cases.flatMap((testCase, caseIndex) => {
			const selected = testCase.expectedSelection !== "ABSTAIN";
			return (["primary", "reversed"] as const).map((order, orderIndex) => ({
				sequence: caseIndex * 2 + orderIndex + 1,
				caseId: testCase.caseId,
				order,
				candidateCount: testCase.candidates.length,
				candidates: testCase.candidates.map((candidate, index) => ({
					label: ["A", "B", "C"][index] as "A" | "B" | "C",
					evidenceId: candidate.id,
				})),
				outcome: selected ? "selected" : "abstained",
				...(selected ? { selection: "A" as const, mappedEvidenceId: testCase.expectedSelection } : {}),
				expectedEvidenceId: testCase.expectedSelection,
				classification: "correct" as const,
				elapsedMs: 1,
			}));
		});

		const segments = summarizeFinalV231Segments(population.boundaryByCase, traces);
		expect(segments).toEqual({
			clearDirectAnswer: {
				primary: { correct: 4, wrong: 0, abstain: 0 },
				reversed: { correct: 4, wrong: 0, abstain: 0 },
			},
			trueInsufficiency: {
				primary: { abstain: 4, unsupportedSelection: 0 },
				reversed: { abstain: 4, unsupportedSelection: 0 },
			},
			hardRelatedInsufficient: {
				primary: { abstain: 4, unsupportedSelection: 0 },
				reversed: { abstain: 4, unsupportedSelection: 0 },
			},
		});
	});
});
