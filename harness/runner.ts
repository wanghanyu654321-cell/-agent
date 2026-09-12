import { hashPopulation } from "../evals/job-ready-rag/freeze.ts";
import type { SupportResult } from "../src/index.ts";
import type { HarnessRun, HarnessService, RunDeclaration, RunInputs, RunReceipt } from "./contracts.ts";
import { declareRun } from "./suites.ts";

/**
 * Calls a trusted, offline composition; never constructs a provider or a new Agent loop.
 * Abort stops subsequent dispatch and completion, but cannot cancel the service's current
 * call: its existing Runtime owns deadlines and side effects. No automatic retry/resume.
 */
export async function runSuite(
	declaration: RunDeclaration,
	inputs: RunInputs,
	service: HarnessService,
	signal?: AbortSignal,
): Promise<{ run: HarnessRun; receipt: RunReceipt }> {
	const snapshot = structuredClone(inputs);
	const actualDeclaration = declareRun(declaration.runId, snapshot);
	if (hashPopulation(actualDeclaration) !== hashPopulation(declaration)) throw new Error("declaration_mismatch");
	const run: HarnessRun = {
		declaration: actualDeclaration,
		measurements: [],
		completionState: "incomplete",
		completionMarker: null,
	};
	for (const item of snapshot.suite.cases) {
		if (signal?.aborted) break;
		try {
			const result = await service.respond(structuredClone(item.context), structuredClone(item.input));
			// Only final returned evidence, never expected gold or intermediate candidates.
			assertReturnedResult(result);
			run.measurements.push({
				caseId: item.caseId,
				finalResult: result.type,
				retrievalStatus: "unverified",
				evidence: result.evidence.map(({ id, version, sourceRef, kind }) => ({ id, version, sourceRef, kind })),
				attemptedOperations: [...result.toolsCalled],
			});
		} catch {
			run.measurements.push({
				caseId: item.caseId,
				finalResult: "execution_error",
				evidence: null,
				attemptedOperations: null,
				retrievalStatus: "unverified",
				errorCategory: "service_error",
			});
			break;
		}
	}
	if (
		!signal?.aborted &&
		run.measurements.length === actualDeclaration.expectedCaseIds.length &&
		run.measurements.every((item) => item.finalResult !== "execution_error")
	) {
		run.completionState = "complete";
		run.completionMarker = { measurementHash: hashPopulation(run.measurements) };
	}
	return { run, receipt: { runHash: hashPopulation(run) } };
}

function assertReturnedResult(result: SupportResult): void {
	if (
		!result ||
		!["answer", "fallback", "escalation"].includes(result.type) ||
		!Array.isArray(result.toolsCalled) ||
		result.toolsCalled.some((item) => typeof item !== "string") ||
		!Array.isArray(result.evidence) ||
		result.evidence.some(
			(item) =>
				!item ||
				![item.id, item.version, item.sourceRef].every((field) => typeof field === "string" && field.trim()) ||
				!["faq", "policy", "sop", "reference"].includes(item.kind),
		)
	) {
		throw new Error("invalid_support_result");
	}
}
