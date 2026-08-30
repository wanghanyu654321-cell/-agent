import type {
	SemanticEvidenceSelector,
	SemanticSelectionCandidate,
	SemanticSelectionResult,
} from "../../../src/semantic-selector.ts";
import type {
	PersistedSemanticInvocationTrace,
	SemanticInvocationOrder,
	SemanticInvocationTrace,
} from "./evaluation.ts";

export interface HoldoutV21EvaluationCandidate {
	id: string;
	title: string;
	content: string;
}

export interface HoldoutV21EvaluationCase {
	caseId: string;
	query: string;
	expectedSelection: string | "ABSTAIN";
	candidates: HoldoutV21EvaluationCandidate[];
}

export interface HoldoutV21OrderMetrics {
	positiveCorrect: number;
	positiveWrong: number;
	positiveAbstain: number;
	abstainCorrect: number;
	unsupportedSelection: number;
}

export interface HoldoutV21Metrics {
	primary: HoldoutV21OrderMetrics;
	reversed: HoldoutV21OrderMetrics;
	invalid: number;
	providerError: number;
	timeout: number;
	orderInducedWrong: number;
	orderInducedOutcomeDisagreement: number;
}

export interface HoldoutV21EvaluationResult {
	semanticCalls: number;
	traces: SemanticInvocationTrace[];
	metrics: HoldoutV21Metrics;
	gatePassed: boolean;
}

export interface ReconstructedHoldoutV21Evaluation {
	status: "complete" | "infrastructure_blocked";
	expectedSemanticCalls: number;
	persistedSemanticCalls: number;
	uniqueInvocationCount: number;
	reason?: string;
	traces?: SemanticInvocationTrace[];
	metrics?: HoldoutV21Metrics;
	gatePassed: boolean;
}

export interface HoldoutV21EvaluationOptions {
	onInvocationComplete?: (trace: SemanticInvocationTrace) => void | Promise<void>;
	existingTraces?: SemanticInvocationTrace[];
}

function labels(candidates: HoldoutV21EvaluationCandidate[]): SemanticSelectionCandidate[] {
	return candidates.map((candidate, index) => ({
		label: ["A", "B", "C"][index] as "A" | "B" | "C",
		title: candidate.title,
		content: candidate.content,
	}));
}

function invocationKey(caseId: string, order: SemanticInvocationOrder): string {
	return `${caseId}\u0000${order}`;
}

function expectedCandidates(
	testCase: HoldoutV21EvaluationCase,
	order: SemanticInvocationOrder,
): Array<{ label: "A" | "B" | "C"; evidenceId: string }> {
	const ordered = order === "primary" ? testCase.candidates : [...testCase.candidates].reverse();
	return labels(ordered).map((candidate, index) => ({ label: candidate.label, evidenceId: ordered[index]!.id }));
}

function asTrace(
	testCase: HoldoutV21EvaluationCase,
	order: SemanticInvocationOrder,
	candidates: HoldoutV21EvaluationCandidate[],
	result: SemanticSelectionResult,
	elapsedMs: number,
): SemanticInvocationTrace {
	const mappedEvidenceId =
		result.outcome === "selected"
			? candidates[labels(candidates).findIndex((candidate) => candidate.label === result.selection)]?.id
			: undefined;
	const classification =
		testCase.expectedSelection === "ABSTAIN"
			? result.outcome === "abstained"
				? "correct"
				: result.outcome === "selected"
					? "wrong"
					: "non_selection"
			: mappedEvidenceId === testCase.expectedSelection
				? "correct"
				: mappedEvidenceId
					? "wrong"
					: "non_selection";
	return {
		caseId: testCase.caseId,
		order,
		candidateCount: candidates.length,
		candidates: expectedCandidates({ ...testCase, candidates }, "primary"),
		outcome: mappedEvidenceId === undefined && result.outcome === "selected" ? "invalid" : result.outcome,
		...(result.outcome === "selected" ? { selection: result.selection } : {}),
		...(mappedEvidenceId ? { mappedEvidenceId } : {}),
		expectedEvidenceId: testCase.expectedSelection,
		classification,
		...(result.observation
			? {
					rawOutputShape: result.observation.rawOutputShape,
					rawOutputSha256: result.observation.rawOutputSha256,
					rawOutputLength: result.observation.rawOutputLength,
				}
			: {}),
		elapsedMs,
	};
}

async function invoke(
	testCase: HoldoutV21EvaluationCase,
	order: SemanticInvocationOrder,
	candidates: HoldoutV21EvaluationCandidate[],
	selector: SemanticEvidenceSelector,
): Promise<SemanticInvocationTrace> {
	const startedAt = performance.now();
	const result = await selector.select(
		{ query: testCase.query, candidates: labels(candidates) },
		new AbortController().signal,
	);
	return asTrace(testCase, order, candidates, result, Math.round(performance.now() - startedAt));
}

function emptyOrderMetrics(): HoldoutV21OrderMetrics {
	return { positiveCorrect: 0, positiveWrong: 0, positiveAbstain: 0, abstainCorrect: 0, unsupportedSelection: 0 };
}

function metricsFromTraces(cases: HoldoutV21EvaluationCase[], traces: SemanticInvocationTrace[]): HoldoutV21Metrics {
	const metrics: HoldoutV21Metrics = {
		primary: emptyOrderMetrics(),
		reversed: emptyOrderMetrics(),
		invalid: 0,
		providerError: 0,
		timeout: 0,
		orderInducedWrong: 0,
		orderInducedOutcomeDisagreement: 0,
	};
	const expectedByCase = new Map(cases.map((testCase) => [testCase.caseId, testCase.expectedSelection]));
	const tracesByKey = new Map(traces.map((trace) => [invocationKey(trace.caseId, trace.order), trace]));
	for (const trace of traces) {
		const expected = expectedByCase.get(trace.caseId);
		if (expected === undefined) continue;
		const order = trace.order === "primary" ? metrics.primary : metrics.reversed;
		if (trace.outcome === "invalid") metrics.invalid += 1;
		if (trace.outcome === "provider_error") metrics.providerError += 1;
		if (trace.outcome === "timeout") metrics.timeout += 1;
		if (expected === "ABSTAIN") {
			if (trace.outcome === "abstained") order.abstainCorrect += 1;
			if (trace.outcome === "selected") order.unsupportedSelection += 1;
		} else if (trace.classification === "correct") order.positiveCorrect += 1;
		else if (trace.classification === "wrong") order.positiveWrong += 1;
		else if (trace.outcome === "abstained") order.positiveAbstain += 1;
	}
	for (const testCase of cases) {
		const primary = tracesByKey.get(invocationKey(testCase.caseId, "primary"));
		const reversed = tracesByKey.get(invocationKey(testCase.caseId, "reversed"));
		if (!primary || !reversed) continue;
		if (
			`${primary.outcome}:${primary.mappedEvidenceId ?? ""}` !==
			`${reversed.outcome}:${reversed.mappedEvidenceId ?? ""}`
		)
			metrics.orderInducedOutcomeDisagreement += 1;
		if (primary.classification === "correct" && reversed.classification === "wrong") metrics.orderInducedWrong += 1;
	}
	return metrics;
}

function exactGatePassed(cases: HoldoutV21EvaluationCase[], metrics: HoldoutV21Metrics): boolean {
	const positiveCount = cases.filter((testCase) => testCase.expectedSelection !== "ABSTAIN").length;
	const abstainCount = cases.length - positiveCount;
	return (
		metrics.primary.positiveCorrect === positiveCount &&
		metrics.primary.positiveWrong === 0 &&
		metrics.primary.positiveAbstain === 0 &&
		metrics.primary.abstainCorrect === abstainCount &&
		metrics.primary.unsupportedSelection === 0 &&
		metrics.reversed.positiveCorrect === positiveCount &&
		metrics.reversed.positiveWrong === 0 &&
		metrics.reversed.positiveAbstain === 0 &&
		metrics.reversed.abstainCorrect === abstainCount &&
		metrics.reversed.unsupportedSelection === 0 &&
		metrics.invalid === 0 &&
		metrics.providerError === 0 &&
		metrics.timeout === 0 &&
		metrics.orderInducedWrong === 0 &&
		metrics.orderInducedOutcomeDisagreement === 0
	);
}

export async function runHoldoutV21Evaluation(
	cases: HoldoutV21EvaluationCase[],
	selector: SemanticEvidenceSelector,
	options: HoldoutV21EvaluationOptions = {},
): Promise<HoldoutV21EvaluationResult> {
	const traces: SemanticInvocationTrace[] = [...(options.existingTraces ?? [])];
	const existing = new Map(traces.map((trace) => [invocationKey(trace.caseId, trace.order), trace]));
	for (const testCase of cases) {
		if (testCase.candidates.length < 2 || testCase.candidates.length > 3)
			throw new Error(`Holdout V2.1 requires 2-3 candidates: ${testCase.caseId}`);
		const primaryKey = invocationKey(testCase.caseId, "primary");
		if (!existing.has(primaryKey)) {
			const primary = await invoke(testCase, "primary", testCase.candidates, selector);
			await options.onInvocationComplete?.(primary);
			traces.push(primary);
			existing.set(primaryKey, primary);
		}
		const reversedKey = invocationKey(testCase.caseId, "reversed");
		if (!existing.has(reversedKey)) {
			const reversed = await invoke(testCase, "reversed", [...testCase.candidates].reverse(), selector);
			await options.onInvocationComplete?.(reversed);
			traces.push(reversed);
			existing.set(reversedKey, reversed);
		}
	}
	const metrics = metricsFromTraces(cases, traces);
	return { semanticCalls: traces.length, traces, metrics, gatePassed: exactGatePassed(cases, metrics) };
}

function traceMismatch(
	trace: PersistedSemanticInvocationTrace,
	testCase: HoldoutV21EvaluationCase,
): string | undefined {
	if (!Number.isSafeInteger(trace.sequence) || trace.sequence < 1) return "has invalid sequence";
	if (trace.expectedEvidenceId !== testCase.expectedSelection) return "has mismatched expected selection";
	const candidates = expectedCandidates(testCase, trace.order);
	if (
		trace.candidateCount !== candidates.length ||
		trace.candidates.length !== candidates.length ||
		trace.candidates.some(
			(candidate, index) =>
				candidate.label !== candidates[index]!.label || candidate.evidenceId !== candidates[index]!.evidenceId,
		)
	)
		return "has mismatched candidate labels";
	if (trace.outcome === "selected") {
		if (!trace.selection || trace.selection === "ABSTAIN" || !trace.mappedEvidenceId)
			return "has incomplete selected outcome";
		if (
			trace.candidates.find((candidate) => candidate.label === trace.selection)?.evidenceId !==
			trace.mappedEvidenceId
		)
			return "has inconsistent selected mapping";
	}
	if (trace.elapsedMs !== undefined && (!Number.isFinite(trace.elapsedMs) || trace.elapsedMs < 0))
		return "has invalid elapsed time";
	return undefined;
}

/** Reconstructs V2.1 Gate metrics only from a complete, contiguous durable journal. */
export function reconstructHoldoutV21Evaluation(
	cases: HoldoutV21EvaluationCase[],
	persistedTraces: PersistedSemanticInvocationTrace[],
): ReconstructedHoldoutV21Evaluation {
	const expectedSemanticCalls = cases.length * 2;
	const casesById = new Map(cases.map((testCase) => [testCase.caseId, testCase]));
	const seenKeys = new Set<string>();
	const seenSequences = new Set<number>();
	let reason: string | undefined;
	for (const trace of persistedTraces) {
		const testCase = casesById.get(trace.caseId);
		const key = invocationKey(trace.caseId, trace.order);
		if (!testCase) reason = `unknown trace case: ${trace.caseId}`;
		else if (seenKeys.has(key)) reason = `duplicate trace: ${trace.caseId}/${trace.order}`;
		else if (seenSequences.has(trace.sequence)) reason = `duplicate trace sequence: ${trace.sequence}`;
		else reason = traceMismatch(trace, testCase);
		if (reason) break;
		seenKeys.add(key);
		seenSequences.add(trace.sequence);
	}
	if (!reason && persistedTraces.length !== expectedSemanticCalls)
		reason = `expected ${expectedSemanticCalls} traces, found ${persistedTraces.length}`;
	if (!reason) {
		for (const testCase of cases) {
			if (
				!seenKeys.has(invocationKey(testCase.caseId, "primary")) ||
				!seenKeys.has(invocationKey(testCase.caseId, "reversed"))
			) {
				reason = `missing trace for ${testCase.caseId}`;
				break;
			}
		}
	}
	if (!reason) {
		const ordered = [...persistedTraces].sort((left, right) => left.sequence - right.sequence);
		for (const [index, trace] of ordered.entries()) {
			if (trace.sequence !== index + 1) {
				reason = `trace sequence is not contiguous at ${index + 1}`;
				break;
			}
		}
	}
	if (reason)
		return {
			status: "infrastructure_blocked",
			expectedSemanticCalls,
			persistedSemanticCalls: persistedTraces.length,
			uniqueInvocationCount: seenKeys.size,
			reason,
			gatePassed: false,
		};
	const traces = [...persistedTraces]
		.sort((left, right) => left.sequence - right.sequence)
		.map(({ sequence: _sequence, ...trace }) => trace);
	const metrics = metricsFromTraces(cases, traces);
	return {
		status: "complete",
		expectedSemanticCalls,
		persistedSemanticCalls: persistedTraces.length,
		uniqueInvocationCount: seenKeys.size,
		traces,
		metrics,
		gatePassed: exactGatePassed(cases, metrics),
	};
}
