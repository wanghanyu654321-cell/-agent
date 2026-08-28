import { describe, expect, it } from "vitest";
import { runPublicRetrievalRegression } from "../evals/retrieval/public-runner.ts";

describe("V2.1 public sanitized retrieval regression", () => {
	it("runs controlled non-business fixtures without presenting them as real knowledge", async () => {
		const report = await runPublicRetrievalRegression();

		expect(report.corpusClassification).toBe("SYNTHETIC_FIXTURE");
		expect(report.queryProvenance).toBe("SYNTHETIC_QUERY");
		expect(report.results).toHaveLength(4);
		expect(report.gatePassed).toBe(true);
		expect(report.metrics.unauthorizedKnowledgeExposureRate).toBe(0);
	});
});
