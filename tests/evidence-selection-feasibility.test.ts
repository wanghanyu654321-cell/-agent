import { describe, expect, it } from "vitest";
import { analyzeCandidateMargins, evaluateMarginThreshold } from "../evals/selection/score-analysis.ts";

describe("V2.2 deterministic evidence-selection feasibility", () => {
	it("records the score/margin counterexample and proves no monotonic threshold satisfies the V2.2 gate", async () => {
		const observations = await analyzeCandidateMargins();
		const byCaseId = new Map(observations.map((observation) => [observation.caseId, observation]));

		expect(byCaseId.get("public-24")).toMatchObject({
			topEvidenceId: "PB-MT-UNCONSUMED-REFUND",
			top1IsExpected: false,
			margin: 10,
		});
		expect(byCaseId.get("public-30")).toMatchObject({
			topEvidenceId: "PB-MT-VOUCHER-USE",
			top1IsExpected: false,
			margin: 12,
		});
		expect(byCaseId.get("public-49")).toMatchObject({
			topEvidenceId: "PB-MT-FULFILLMENT-ALTERNATIVE",
			top1IsExpected: true,
			margin: 6,
		});

		const acceptAll = evaluateMarginThreshold(observations, 0);
		expect(acceptAll).toMatchObject({ selected: 50, correct: 48, wrong: 2, coverage: 1, correctSelectionRate: 0.96 });

		const rejectBothWrong = evaluateMarginThreshold(observations, 13);
		expect(rejectBothWrong).toMatchObject({
			selected: 47,
			correct: 47,
			wrong: 0,
			coverage: 0.94,
			correctSelectionRate: 0.94,
		});

		const thresholds = [
			0,
			...new Set(
				observations
					.filter((observation) => observation.margin !== undefined)
					.flatMap((observation) => [observation.margin!, observation.margin! + 0.5]),
			),
		];
		expect(
			thresholds.some((threshold) => {
				const result = evaluateMarginThreshold(observations, threshold);
				return result.wrong === 0 && result.correctSelectionRate >= 0.95 && result.coverage >= 0.95;
			}),
		).toBe(false);
	});
});
