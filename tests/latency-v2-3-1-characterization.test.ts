import { describe, expect, it } from "vitest";
import { buildLatencyPopulationV231 } from "../evals/selection/semantic/latency-v2.3.1/population.ts";
import {
	deriveLatencyMetricsV231,
	type LatencyMetricTraceV231,
} from "../evals/selection/semantic/run-latency-v2-3-1-characterization.ts";

describe("V2.3.1 latency characterization", () => {
	it("freezes exactly ten already-exposed inputs with both two and three candidates", () => {
		const population = buildLatencyPopulationV231();

		expect(population.inputs).toHaveLength(10);
		expect(population.inputs.filter((input) => input.candidates.length === 2)).not.toHaveLength(0);
		expect(population.inputs.filter((input) => input.candidates.length === 3)).not.toHaveLength(0);
		expect(new Set(population.inputs.map((input) => input.historicalSourceCaseId)).size).toBe(10);
		expect(population.inputs.every((input) => input.modelInputBytes > 0)).toBe(true);
	});

	it("derives latency percentiles and every counterfactual budget from durable traces", () => {
		const traces: LatencyMetricTraceV231[] = [
			{
				round: 1,
				outcome: "selected",
				elapsedMs: 2_500,
				timeout: false,
				providerError: false,
				invalid: false,
			},
			{
				round: 1,
				outcome: "abstained",
				elapsedMs: 5_000,
				timeout: false,
				providerError: false,
				invalid: false,
			},
			{
				round: 2,
				outcome: "timeout",
				elapsedMs: 30_000,
				timeout: true,
				providerError: false,
				invalid: false,
			},
		];

		const metrics = deriveLatencyMetricsV231(traces, 30);
		expect(metrics.actualCalls).toBe(3);
		expect(metrics.successfulResponses).toBe(2);
		expect(metrics.timeouts).toBe(1);
		expect(metrics.latency.meanMs).toBe(3_750);
		expect(metrics.latency.p50Ms).toBe(2_500);
		expect(metrics.counterfactualBudgets.find((budget) => budget.budgetMs === 2_000)).toMatchObject({
			exceededCount: 3,
		});
		expect(metrics.counterfactualBudgets.find((budget) => budget.budgetMs === 5_000)).toMatchObject({
			exceededCount: 1,
		});
		expect(metrics.counterfactualBudgets.find((budget) => budget.budgetMs === 30_000)).toMatchObject({
			exceededCount: 0,
		});
	});
});
