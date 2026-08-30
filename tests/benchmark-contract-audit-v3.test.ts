import { describe, expect, it } from "vitest";
import {
	buildBenchmarkContractAuditV3,
	joinRecovery2Diagnostics,
} from "../evals/selection/semantic/benchmark-contract-audit-v3.ts";

describe("V3 benchmark audit", () => {
	it("joins every immutable Recovery-2 trace exactly once", () => {
		const audit = buildBenchmarkContractAuditV3();
		expect(audit.summary).toEqual({ SUPPORTED: 39, PARTIAL: 11, UNSUPPORTED: 0 });
		expect(audit.cases.find((item) => item.caseId === "public-38")?.contractClassification).toBe("SUPPORTED");
		expect(audit.cases.find((item) => item.caseId === "public-39")?.contractClassification).toBe("SUPPORTED");
		expect(joinRecovery2Diagnostics()).toEqual({
			joinedTotal: 44,
			supported: { total: 38, selected: 38, abstain: 0, wrong: 0, correct: 38 },
			partialOrUnsupported: { total: 6, selected: 3, abstain: 3, wrong: 0, correct: 3 },
		});
	});
});
