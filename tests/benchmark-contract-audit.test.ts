import { describe, expect, it } from "vitest";
import { buildBenchmarkContractAudit } from "../evals/selection/semantic/benchmark-contract-audit.ts";

describe("V2.3 benchmark contract audit", () => {
	it("classifies every frozen answerable case before joining selector traces", () => {
		const audit = buildBenchmarkContractAudit();

		expect(audit.cases).toHaveLength(50);
		expect(audit.summary).toEqual({ supported: 41, partial: 9, unsupported: 0 });
		expect(audit.cases.find((entry) => entry.caseId === "public-04")).toMatchObject({
			contractClassification: "PARTIAL",
			directness: "indirect",
			sufficiency: "partial",
		});
		expect(audit.cases.find((entry) => entry.caseId === "public-28")).toMatchObject({
			contractClassification: "PARTIAL",
			requiredUnsupportedInference: true,
		});
	});
});
