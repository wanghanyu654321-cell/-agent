import { hashPopulation } from "../evals/job-ready-rag/freeze.ts";
import type {
	AcceptanceCaseEvaluation,
	AcceptanceDimensionStatus,
	AcceptanceEvaluation,
	AcceptanceExpectation,
	DurableObservation,
	DurableStateExpectation,
	HarnessRun,
	IntegrityEvaluation,
	RunDeclaration,
	RunReceipt,
} from "./contracts.ts";

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

/**
 * Acceptance only. Durable state is never inferred from attempted operations or
 * response text: callers must provide a complete authoritative observation per
 * durable case. This evaluator deliberately has no repository, provider or clock.
 */
export function evaluateAcceptance(
	run: HarnessRun,
	expectations: readonly AcceptanceExpectation[],
	observations: readonly DurableObservation[],
): AcceptanceEvaluation {
	try {
		const issues: string[] = [];
		const expectationsByCase = indexByCase(expectations);
		const measurementsByCase = indexByCase(run.measurements);
		const observationsByCase = indexByCase(observations);
		const expectedCaseIds = new Set(expectationsByCase.keys());

		for (const measurement of run.measurements) {
			if (!expectedCaseIds.has(measurement.caseId)) issues.push(`unexpected_measurement_case:${measurement.caseId}`);
		}

		const cases: AcceptanceCaseEvaluation[] = [];
		for (const [caseId, caseExpectations] of expectationsByCase) {
			const caseMeasurements = measurementsByCase.get(caseId) ?? [];
			const caseObservations = observationsByCase.get(caseId) ?? [];
			const expectation = caseExpectations[0];
			if (!expectation) throw new Error("Missing acceptance expectation.");
			if (caseExpectations.length !== 1) issues.push(`duplicate_expectation_case:${caseId}`);
			if (caseMeasurements.length === 0) issues.push(`measurement_missing:${caseId}`);
			else if (caseMeasurements.length !== 1) issues.push(`duplicate_measurement_case:${caseId}`);
			const durableObservationValid = validateDurableObservation(
				caseId,
				expectation.durableState,
				caseObservations,
				issues,
			);

			if (caseExpectations.length !== 1 || caseMeasurements.length !== 1) {
				cases.push({ caseId, outcome: "fail", evidence: "fail", durableState: "fail" });
				continue;
			}

			const measurement = caseMeasurements[0];
			if (!measurement) throw new Error("Missing case measurement.");
			const outcome = evaluateOutcome(measurement.finalResult, expectation);
			const evidence = evaluateEvidence(measurement.evidence, expectation);
			const durableState = durableObservationValid
				? evaluateDurableState(caseId, expectation.durableState, caseObservations, issues)
				: "fail";
			if (outcome === "fail") issues.push(`outcome_mismatch:${caseId}`);
			if (evidence === "fail") issues.push(`evidence_mismatch:${caseId}`);
			cases.push({ caseId, outcome, evidence, durableState });
		}

		return { acceptance: issues.length === 0 ? "pass" : "fail", cases, issues };
	} catch {
		return {
			acceptance: "fail",
			cases: [],
			issues: ["malformed_acceptance_input"],
		};
	}
}

function indexByCase<T extends { caseId: string }>(items: readonly T[]): Map<string, T[]> {
	const byCase = new Map<string, T[]>();
	for (const item of items) {
		const existing = byCase.get(item.caseId);
		if (existing) existing.push(item);
		else byCase.set(item.caseId, [item]);
	}
	return byCase;
}

function evaluateOutcome(
	finalResult: HarnessRun["measurements"][number]["finalResult"],
	expectation: AcceptanceExpectation,
): AcceptanceDimensionStatus {
	if (expectation.outcome === "not_required") return "not_required";
	return finalResult === expectation.outcome.finalResult ? "pass" : "fail";
}

function evaluateEvidence(
	evidence: HarnessRun["measurements"][number]["evidence"],
	expectation: AcceptanceExpectation,
): AcceptanceDimensionStatus {
	if (expectation.evidence === "not_required") return "not_required";
	if (!evidence) return "fail";
	return expectation.evidence.required.every((required) =>
		evidence.some(
			(actual) =>
				actual.id === required.id &&
				actual.kind === required.kind &&
				actual.version === required.version &&
				actual.sourceRef === required.sourceRef,
		),
	)
		? "pass"
		: "fail";
}

function evaluateDurableState(
	caseId: string,
	expectation: DurableStateExpectation,
	observations: readonly DurableObservation[],
	issues: string[],
): AcceptanceDimensionStatus {
	if (expectation.kind === "not_required") return "not_required";
	const observation = observations[0];
	if (!observation) throw new Error("Missing durable observation.");
	if (expectation.kind === "ticket") {
		const matchingCount = observation.tickets.filter(
			(ticket) =>
				ticket.tenantId === expectation.tenantId &&
				ticket.storeId === expectation.storeId &&
				ticket.conversationId === expectation.conversationId &&
				ticket.idempotencyKey === expectation.idempotencyKey,
		).length;
		if (matchingCount === expectation.count) return "pass";
	} else if (expectation.kind === "handoff") {
		const matchingCount = observation.handoffs.filter(
			(handoff) =>
				handoff.tenantId === expectation.tenantId &&
				handoff.storeId === expectation.storeId &&
				handoff.conversationId === expectation.conversationId,
		).length;
		if (matchingCount === expectation.count) return "pass";
	} else {
		const matchingWrites =
			observation.tickets.filter(
				(ticket) =>
					ticket.tenantId === expectation.tenantId &&
					ticket.storeId === expectation.storeId &&
					ticket.conversationId === expectation.conversationId,
			).length +
			observation.handoffs.filter(
				(handoff) =>
					handoff.tenantId === expectation.tenantId &&
					handoff.storeId === expectation.storeId &&
					handoff.conversationId === expectation.conversationId,
			).length;
		if (matchingWrites === expectation.count) return "pass";
	}

	issues.push(`durable_state_mismatch:${caseId}`);
	return "fail";
}

function validateDurableObservation(
	caseId: string,
	expectation: DurableStateExpectation,
	observations: readonly DurableObservation[],
	issues: string[],
): boolean {
	if (expectation.kind === "not_required") return true;
	if (observations.length === 1) return true;
	issues.push(
		observations.length === 0
			? `durable_observation_missing:${caseId}`
			: `duplicate_durable_observation:${caseId}`,
	);
	return false;
}
