import { describe, expect, it } from "vitest";
import {
	buildHoldoutV22EvaluationCases,
	HOLDOUT_V22_FROZEN_COMMIT,
	HOLDOUT_V22_TIMEOUT_MS,
} from "../evals/selection/semantic/run-holdout-v2-2-boundary-gate.ts";

describe("Holdout V2.2 OAuth-aware Gate runner", () => {
	it("uses only the frozen V2.2 inputs and exactly 24 future invocations", () => {
		const evaluation = buildHoldoutV22EvaluationCases();

		expect(HOLDOUT_V22_FROZEN_COMMIT).toBe("e34e82847bb1e2465924e34c043d5e492d4dde2f");
		expect(HOLDOUT_V22_TIMEOUT_MS).toBe(15_000);
		expect(evaluation.cases).toHaveLength(12);
		expect(evaluation.cases.filter((item) => item.expectedSelection !== "ABSTAIN")).toHaveLength(4);
		expect(evaluation.cases.filter((item) => item.expectedSelection === "ABSTAIN")).toHaveLength(8);
		expect(evaluation.cases.every((item) => item.candidates.length >= 2 && item.candidates.length <= 3)).toBe(true);
	});
});
