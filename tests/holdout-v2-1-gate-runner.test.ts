import { describe, expect, it } from "vitest";
import {
	buildHoldoutV21EvaluationCases,
	HOLDOUT_V21_ATTEMPT_MANIFEST,
	HOLDOUT_V21_FROZEN_COMMIT,
	HOLDOUT_V21_REPORT,
	HOLDOUT_V21_TIMEOUT_MS,
	HOLDOUT_V21_TRACES,
} from "../evals/selection/semantic/run-holdout-v2-1-gate.ts";

describe("Holdout V2.1 OAuth-aware Gate runner", () => {
	it("uses only the frozen V2.1 inputs and creates a distinct durable attempt identity", () => {
		const evaluation = buildHoldoutV21EvaluationCases();

		expect(HOLDOUT_V21_FROZEN_COMMIT).toBe("1c0ebd44128a32a98cc3ed1fca915fcd88a2e764");
		expect(HOLDOUT_V21_TIMEOUT_MS).toBe(15_000);
		expect(HOLDOUT_V21_ATTEMPT_MANIFEST).toBe("unseen-holdout-v2-1-attempt-manifest.json");
		expect(HOLDOUT_V21_TRACES).toBe("unseen-holdout-v2-1-traces.jsonl");
		expect(HOLDOUT_V21_REPORT).toBe("unseen-holdout-v2-1-run.json");
		expect(evaluation.cases).toHaveLength(24);
		expect(
			evaluation.cases.every((testCase) => testCase.candidates.length >= 2 && testCase.candidates.length <= 3),
		).toBe(true);
		expect(evaluation.cases.filter((testCase) => testCase.expectedSelection === "ABSTAIN")).toHaveLength(6);
	});
});
