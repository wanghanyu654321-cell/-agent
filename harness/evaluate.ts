import { hashPopulation } from "../evals/job-ready-rag/freeze.ts";
import type { HarnessRun, IntegrityEvaluation, RunDeclaration, RunReceipt } from "./contracts.ts";

/**
 * Integrity only. References must be retained independently: recalculating a receipt
 * from an edited report defeats the check. Hashes are not signatures or proof of
 * actual provider/configuration/DB state. No retrieval or answer quality is scored.
 */
export function evaluateRun(run: HarnessRun, expected: RunDeclaration, receipt: RunReceipt): IntegrityEvaluation {
	const issues: string[] = [];
	try {
		if (hashPopulation(run) !== receipt.runHash) issues.push("receipt_mismatch");
		if (hashPopulation(run.declaration) !== hashPopulation(expected)) issues.push("declaration_mismatch");
		const actualIds = run.measurements.map((item) => item.caseId);
		if (
			new Set(actualIds).size !== actualIds.length ||
			new Set(expected.expectedCaseIds).size !== expected.expectedCaseIds.length
		) {
			issues.push("duplicate_case");
		}
		if (!expected.expectedCaseIds.length || hashPopulation(actualIds) !== hashPopulation(expected.expectedCaseIds)) {
			issues.push("case_population_mismatch");
		}
		if (run.measurements.some((item) => item.finalResult === "execution_error")) issues.push("execution_error");
		if (run.completionState !== "complete") issues.push("execution_incomplete");
		if (!run.completionMarker) issues.push("completion_marker_missing");
		else if (run.completionMarker.measurementHash !== hashPopulation(run.measurements))
			issues.push("completion_marker_mismatch");
	} catch {
		issues.push("malformed_run");
	}
	return {
		integrity: issues.length ? "failed" : "verified",
		completionState: issues.length ? "incomplete" : "complete",
		issues,
		quality: "not_evaluated",
	};
}
