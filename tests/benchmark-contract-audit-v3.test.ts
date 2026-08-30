import { describe, expect, it } from "vitest";
import {
	buildBenchmarkContractAuditV3,
	joinRecovery2Diagnostics,
	joinRecovery2Traces,
	loadRecovery2Traces,
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

	it("rejects every incomplete or ambiguous in-memory Recovery-2 join", () => {
		const traces = loadRecovery2Traces();
		expect(() => joinRecovery2Traces(traces)).not.toThrow();
		expect(() => joinRecovery2Traces([...traces, traces[0]!])).toThrow();
		expect(() => joinRecovery2Traces(traces.slice(1))).toThrow();
		expect(() =>
			joinRecovery2Traces(
				traces.map((trace, index) => (index === 0 ? { ...trace, order: "unexpected" as never } : trace)),
			),
		).toThrow();
		expect(() =>
			joinRecovery2Traces(
				traces.map((trace, index) => (index === 0 ? { ...trace, caseId: "unknown-case" } : trace)),
			),
		).toThrow();
	});
});
