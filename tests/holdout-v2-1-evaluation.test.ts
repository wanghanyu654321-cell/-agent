import { describe, expect, it } from "vitest";
import {
	type HoldoutV21EvaluationCase,
	reconstructHoldoutV21Evaluation,
	runHoldoutV21Evaluation,
} from "../evals/selection/semantic/holdout-v2.1-evaluation.ts";
import type { SemanticEvidenceSelector } from "../src/semantic-selector.ts";

const cases: HoldoutV21EvaluationCase[] = [
	{
		caseId: "positive",
		query: "positive",
		expectedSelection: "gold",
		candidates: [
			{ id: "gold", title: "gold", content: "GOLD" },
			{ id: "other", title: "other", content: "OTHER" },
		],
	},
	{
		caseId: "abstain",
		query: "abstain",
		expectedSelection: "ABSTAIN",
		candidates: [
			{ id: "first", title: "first", content: "FIRST" },
			{ id: "second", title: "second", content: "SECOND" },
		],
	},
];

const selector: SemanticEvidenceSelector = {
	async select(input) {
		if (input.query === "abstain") return { selection: "ABSTAIN", outcome: "abstained" };
		return {
			selection: input.candidates.find((candidate) => candidate.content === "GOLD")!.label,
			outcome: "selected",
		};
	},
};

describe("Holdout V2.1 exact semantic Gate reconstruction", () => {
	it("requires both orders to satisfy the positive and hard-ABSTAIN contracts", async () => {
		const evaluation = await runHoldoutV21Evaluation(cases, selector);

		expect(evaluation.semanticCalls).toBe(4);
		expect(evaluation.gatePassed).toBe(true);
		expect(evaluation.metrics).toMatchObject({
			primary: {
				positiveCorrect: 1,
				positiveWrong: 0,
				positiveAbstain: 0,
				abstainCorrect: 1,
				unsupportedSelection: 0,
			},
			reversed: {
				positiveCorrect: 1,
				positiveWrong: 0,
				positiveAbstain: 0,
				abstainCorrect: 1,
				unsupportedSelection: 0,
			},
			invalid: 0,
			providerError: 0,
			timeout: 0,
			orderInducedWrong: 0,
			orderInducedOutcomeDisagreement: 0,
		});
	});

	it("treats a selection in a hard-ABSTAIN case as unsafe and fails closed", async () => {
		const unsafeSelector: SemanticEvidenceSelector = {
			async select() {
				return { selection: "A", outcome: "selected" };
			},
		};
		const evaluation = await runHoldoutV21Evaluation(cases, unsafeSelector);

		expect(evaluation.gatePassed).toBe(false);
		expect(evaluation.metrics.primary.unsupportedSelection).toBe(1);
		expect(
			evaluation.traces.find((trace) => trace.caseId === "abstain" && trace.order === "primary")?.classification,
		).toBe("wrong");
	});

	it("derives the exact result only from a complete, contiguous journal", async () => {
		const evaluation = await runHoldoutV21Evaluation(cases, selector);
		const persisted = evaluation.traces.map((trace, index) => ({ ...trace, sequence: index + 1 }));

		expect(reconstructHoldoutV21Evaluation(cases, persisted)).toMatchObject({
			status: "complete",
			expectedSemanticCalls: 4,
			persistedSemanticCalls: 4,
			gatePassed: true,
		});
		expect(reconstructHoldoutV21Evaluation(cases, persisted.slice(0, 3))).toMatchObject({
			status: "infrastructure_blocked",
			gatePassed: false,
		});
	});

	it("continues only missing identities when a valid durable prefix is supplied", async () => {
		const first = await runHoldoutV21Evaluation(cases.slice(0, 1), selector);
		let calls = 0;
		const countedSelector: SemanticEvidenceSelector = {
			async select(input, signal) {
				calls += 1;
				return selector.select(input, signal);
			},
		};
		const resumed = await runHoldoutV21Evaluation(cases, countedSelector, { existingTraces: first.traces });

		expect(calls).toBe(2);
		expect(resumed.semanticCalls).toBe(4);
		expect(resumed.gatePassed).toBe(true);
	});
});
