import { describe, expect, it } from "vitest";
import { buildBenchmarkContractAuditV2 } from "../evals/selection/semantic/benchmark-contract-audit-v2.ts";

describe("V2 benchmark contract audit", () => {
	it("uses one explicit finding for every frozen answerable case", () => {
		const audit = buildBenchmarkContractAuditV2();
		expect(audit.cases).toHaveLength(50);
		expect(new Set(audit.cases.map((item) => item.caseId)).size).toBe(50);
		expect(
			audit.cases.every(
				(item) => item.reason.length > 0 && item.queryIntent.length > 0 && item.evidenceFact.length > 0,
			),
		).toBe(true);
		expect(audit.summary).toEqual({ SUPPORTED: 37, PARTIAL: 13, UNSUPPORTED: 0 });
	});
});
