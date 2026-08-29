import { describe, expect, it } from "vitest";
import { runSemanticSelectionEvaluation } from "../evals/selection/semantic/evaluation.ts";
import type { SemanticEvidenceSelector } from "../src/semantic-selector.ts";

const contentClassifier: SemanticEvidenceSelector = {
	async select(input) {
		const candidate = input.candidates.find((item) => item.content.includes("ORIGINAL_PAYMENT"));
		return candidate
			? { selection: candidate.label, outcome: "selected" }
			: { selection: "ABSTAIN", outcome: "abstained" };
	},
};

describe("V2.3 offline semantic-selection evaluation", () => {
	it("calculates direct and semantic selections independently while checking candidate-order robustness", async () => {
		const result = await runSemanticSelectionEvaluation(
			[
				{
					caseId: "single",
					query: "single query",
					expectedEvidenceId: "gold-single",
					candidates: [{ id: "gold-single", title: "single", content: "SINGLE" }],
				},
				{
					caseId: "ambiguous",
					query: "refund destination",
					expectedEvidenceId: "gold-payment",
					candidates: [
						{ id: "wrong-refund", title: "refund", content: "UNCONSUMED_REFUND" },
						{ id: "gold-payment", title: "payment", content: "ORIGINAL_PAYMENT" },
					],
				},
			],
			contentClassifier,
		);

		expect(result.metrics).toMatchObject({
			correctSelectionRate: 1,
			wrongSelectionRate: 0,
			answerableCoverage: 1,
			selectedEvidencePrecision: 1,
			multiCandidateWrongSelectionRate: 0,
			orderInducedWrongSelectionRate: 0,
		});
		expect(result.semanticCalls).toBe(2);
	});

	it("fails the semantic gate when a multi-candidate selection is wrong", async () => {
		const wrong: SemanticEvidenceSelector = {
			async select() {
				return { selection: "A", outcome: "selected" };
			},
		};
		const result = await runSemanticSelectionEvaluation(
			[
				{
					caseId: "wrong",
					query: "query",
					expectedEvidenceId: "gold",
					candidates: [
						{ id: "wrong", title: "wrong", content: "WRONG" },
						{ id: "gold", title: "gold", content: "GOLD" },
					],
				},
			],
			wrong,
		);
		expect(result.metrics.wrongSelectionRate).toBe(1);
		expect(result.gatePassed).toBe(false);
	});

	it("does not mislabel an already-wrong selection as order-induced", async () => {
		const alwaysFirst: SemanticEvidenceSelector = {
			async select() {
				return { selection: "A", outcome: "selected" };
			},
		};
		const result = await runSemanticSelectionEvaluation(
			[
				{
					caseId: "already-wrong",
					query: "query",
					expectedEvidenceId: "gold",
					candidates: [
						{ id: "wrong-one", title: "wrong one", content: "WRONG_ONE" },
						{ id: "gold", title: "gold", content: "GOLD" },
						{ id: "wrong-two", title: "wrong two", content: "WRONG_TWO" },
					],
				},
			],
			alwaysFirst,
		);
		expect(result.metrics.orderInducedWrongSelectionRate).toBe(0);
	});
});
