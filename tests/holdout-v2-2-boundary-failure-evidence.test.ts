import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readDurableSemanticGateTraces } from "../evals/selection/semantic/durable-journal.ts";
import { reconstructHoldoutV21Evaluation } from "../evals/selection/semantic/holdout-v2.1-evaluation.ts";
import { buildHoldoutV22EvaluationCases } from "../evals/selection/semantic/run-holdout-v2-2-boundary-gate.ts";

describe("V2.2 sufficiency-boundary failure evidence", () => {
	it("derives the complete failed Gate only from the contiguous durable journal", () => {
		const journal = readDurableSemanticGateTraces(
			join(import.meta.dirname, "../evals/selection/semantic/reports/sufficiency-boundary-v2-2-traces.jsonl"),
		);
		const result = reconstructHoldoutV21Evaluation(buildHoldoutV22EvaluationCases().cases, journal.traces);

		expect(journal.incompleteTrailingLine).toBe(false);
		expect(journal.traces.map((trace) => trace.sequence)).toEqual(
			Array.from({ length: 24 }, (_, index) => index + 1),
		);
		expect(result).toMatchObject({
			status: "complete",
			expectedSemanticCalls: 24,
			persistedSemanticCalls: 24,
			gatePassed: false,
			metrics: {
				primary: { positiveCorrect: 4, abstainCorrect: 6, unsupportedSelection: 2 },
				reversed: { positiveCorrect: 4, abstainCorrect: 3, unsupportedSelection: 5 },
				invalid: 0,
				providerError: 0,
				timeout: 0,
				orderInducedWrong: 4,
				orderInducedOutcomeDisagreement: 5,
			},
		});
	});
});
