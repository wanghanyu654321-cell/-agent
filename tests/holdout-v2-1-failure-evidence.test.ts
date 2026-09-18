import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readDurableSemanticGateTraces } from "../evals/selection/semantic/durable-journal.ts";
import { reconstructHoldoutV21Evaluation } from "../evals/selection/semantic/holdout-v2.1-evaluation.ts";
import { buildHoldoutV21EvaluationCases } from "../evals/selection/semantic/run-holdout-v2-1-gate.ts";

const reports = join(import.meta.dirname, "../evals/selection/semantic/reports");

describe("Holdout V2.1 immutable first-exposure failure evidence", () => {
	it("derives the recorded failed Gate only from the complete durable journal", () => {
		const report = JSON.parse(readFileSync(join(reports, "unseen-holdout-v2-1-run.json"), "utf8")) as {
			actualSemanticCalls: number;
			journalRecordCount: number;
			gateStatus: string;
			gatePassed: boolean;
			metrics: unknown;
		};
		const journal = readDurableSemanticGateTraces(join(reports, "unseen-holdout-v2-1-traces.jsonl"));
		const recovery = reconstructHoldoutV21Evaluation(buildHoldoutV21EvaluationCases().cases, journal.traces);

		expect(journal.incompleteTrailingLine).toBe(false);
		expect(journal.traces.map((trace) => trace.sequence)).toEqual(
			Array.from({ length: 48 }, (_, index) => index + 1),
		);
		expect(recovery).toMatchObject({
			status: "complete",
			expectedSemanticCalls: 48,
			persistedSemanticCalls: 48,
			gatePassed: false,
			metrics: {
				primary: { positiveCorrect: 18, abstainCorrect: 5, unsupportedSelection: 1 },
				reversed: { positiveCorrect: 18, abstainCorrect: 5, unsupportedSelection: 1 },
				invalid: 0,
				providerError: 0,
				timeout: 0,
				orderInducedWrong: 0,
				orderInducedOutcomeDisagreement: 0,
			},
		});
		expect(report).toMatchObject({
			actualSemanticCalls: 48,
			journalRecordCount: 48,
			gateStatus: "failed",
			gatePassed: false,
			metrics: recovery.metrics,
		});
		expect(
			journal.traces
				.filter((trace) => trace.classification === "wrong")
				.map((trace) => `${trace.caseId}/${trace.order}`),
		).toEqual(["holdout-v2.1-23/primary", "holdout-v2.1-23/reversed"]);
	});
});
