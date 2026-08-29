import { describe, expect, it } from "vitest";
import {
	loadPublicBenchmarkEntries,
	publicBenchmarkCases,
	runPublicBenchmarkEvaluation,
	runPublicBenchmarkRuntimeEvaluation,
} from "../evals/retrieval/public-benchmark.ts";
import { isRetrievalQualityGatePassed } from "../src/retrieval-eval.ts";

describe("V2.1 public real-world retrieval benchmark", () => {
	it("uses only governed public-official entries and all required query provenance roles", () => {
		const entries = loadPublicBenchmarkEntries();
		expect(entries.length).toBeGreaterThanOrEqual(10);
		expect(entries.every((entry) => entry.status === "approved")).toBe(true);
		expect(entries.every((entry) => entry.sourceRef.startsWith("https://"))).toBe(true);
		expect(publicBenchmarkCases.length).toBeGreaterThanOrEqual(60);
		expect(new Set(publicBenchmarkCases.map((testCase) => testCase.queryProvenance))).toEqual(
			new Set(["PUBLIC_REAL_CASE", "HUMAN_AUTHORED", "SYNTHETIC_QUERY"]),
		);
	});

	it("rejects a retrieval-quality gate with more than five percent wrong evidence", () => {
		expect(
			isRetrievalQualityGatePassed({
				top1HitRate: 1,
				recallAt3: 1,
				noAnswerCorrectRejectionRate: 1,
				wrongEvidenceRate: 0.06,
				crossTenantLeakageRate: 0,
				crossStoreLeakageRate: 0,
				unauthorizedKnowledgeExposureRate: 0,
				queryProvenanceBreakdown: {},
				categoryBreakdown: {},
			}),
		).toBe(false);
	});

	it("measures the public corpus through real Pi tool events and persisted audit evidence", async () => {
		const retrieval = await runPublicBenchmarkEvaluation();
		const runtime = await runPublicBenchmarkRuntimeEvaluation();

		expect(retrieval.final.gatePassed).toBe(true);
		expect(runtime.gatePassed).toBe(true);
		expect(runtime.metrics.unsupportedBusinessFactRate).toBe(0);
		expect(runtime.metrics.evidenceTraceAccuracy).toBe(1);
		expect(runtime.metrics.evidenceVersionTraceAccuracy).toBe(1);
		expect(runtime.metrics.noEvidenceFailClosedRate).toBe(1);
		expect(runtime.metrics.unauthorizedFaqModelExposureRate).toBe(0);
		expect(runtime.results.every((result) => result.agentToolEvents.includes("search_knowledge"))).toBe(true);
		expect(runtime.results.every((result) => result.auditRead)).toBe(true);
	});
});
