import type {
	SemanticEvidenceSelector,
	SemanticSelectionCandidate,
	SemanticSelectionObservation,
	SemanticSelectionResult,
} from "../../../src/semantic-selector.ts";

export interface SemanticEvaluationCandidate {
	id: string;
	title: string;
	content: string;
}

export interface SemanticEvaluationCase {
	caseId: string;
	query: string;
	expectedEvidenceId: string;
	candidates: SemanticEvaluationCandidate[];
}

export interface SemanticSelectionMetrics {
	correctSelectionRate: number;
	wrongSelectionRate: number;
	answerableCoverage: number;
	selectedEvidencePrecision: number;
	abstentionRate: number;
	invalidSelectorOutputRate: number;
	providerErrorRate: number;
	timeoutRate: number;
	multiCandidateSemanticAccuracy: number;
	multiCandidateWrongSelectionRate: number;
	orderRobustCorrectSelectionRate: number;
	orderInducedWrongSelectionRate: number;
}

export type SemanticInvocationOrder = "primary" | "reversed";
export type SemanticInvocationClassification = "correct" | "wrong" | "non_selection";

export interface SemanticInvocationTrace {
	caseId: string;
	order: SemanticInvocationOrder;
	candidateCount: number;
	candidates: Array<{ label: SemanticSelectionCandidate["label"]; evidenceId: string }>;
	outcome: SemanticSelectionResult["outcome"];
	selection?: SemanticSelectionResult["selection"];
	mappedEvidenceId?: string;
	expectedEvidenceId: string;
	classification: SemanticInvocationClassification;
	rawOutputShape?: SemanticSelectionObservation["rawOutputShape"];
	rawOutputSha256?: string;
	rawOutputLength?: number;
	elapsedMs?: number;
}

export interface SemanticLatencyStatistics {
	minMs: number;
	p50Ms: number;
	p95Ms: number;
	maxMs: number;
}

export interface SemanticEvaluationResult {
	semanticCalls: number;
	metrics: SemanticSelectionMetrics;
	traces: SemanticInvocationTrace[];
	traceSummary: SemanticTraceSummary;
	latency: SemanticLatencyStatistics;
	gatePassed: boolean;
}

/** Optional product-owned observer used by durable evaluators after each completed model invocation. */
export interface SemanticEvaluationOptions {
	onInvocationComplete?: (trace: SemanticInvocationTrace) => void | Promise<void>;
}

/** A trace persisted outside the evaluator includes its journal sequence. */
export interface PersistedSemanticInvocationTrace extends SemanticInvocationTrace {
	sequence: number;
}

export interface ReconstructedSemanticSelectionEvaluation {
	status: "complete" | "infrastructure_blocked";
	expectedSemanticCalls: number;
	persistedSemanticCalls: number;
	uniqueInvocationCount: number;
	reason?: string;
	metrics?: SemanticSelectionMetrics;
	traces?: SemanticInvocationTrace[];
	traceSummary?: SemanticTraceSummary;
	latency?: SemanticLatencyStatistics;
	gatePassed: boolean;
}

export interface SemanticTraceSummary {
	primary: SemanticOutcomeCounts;
	reversed: SemanticOutcomeCounts;
	rawOutputShapes: Partial<Record<NonNullable<SemanticInvocationTrace["rawOutputShape"]>, number>>;
	correct: number;
	wrong: number;
	nonSelection: number;
}

export interface SemanticOutcomeCounts {
	selected: number;
	abstained: number;
	invalid: number;
	timeout: number;
	providerError: number;
}

type ClassifiedSelection = { selectedId?: string; result?: SemanticSelectionResult; elapsedMs?: number };

function labels(candidates: SemanticEvaluationCandidate[]): SemanticSelectionCandidate[] {
	return candidates.map((candidate, index) => ({
		label: ["A", "B", "C"][index] as "A" | "B" | "C",
		title: candidate.title,
		content: candidate.content,
	}));
}

async function classify(
	testCase: SemanticEvaluationCase,
	candidates: SemanticEvaluationCandidate[],
	selector: SemanticEvidenceSelector,
): Promise<ClassifiedSelection> {
	if (candidates.length === 1) return { selectedId: candidates[0]!.id };
	const labelled = labels(candidates);
	const startedAt = performance.now();
	const result = await selector.select({ query: testCase.query, candidates: labelled }, new AbortController().signal);
	const elapsedMs = Math.round(performance.now() - startedAt);
	if (result.outcome !== "selected") return { result, elapsedMs };
	const index = labelled.findIndex((candidate) => candidate.label === result.selection);
	return index < 0
		? { result: { ...result, selection: "ABSTAIN", outcome: "invalid" }, elapsedMs }
		: { selectedId: candidates[index]!.id, result, elapsedMs };
}

function rate(numerator: number, denominator: number): number {
	return numerator / Math.max(1, denominator);
}

function createTrace(
	testCase: SemanticEvaluationCase,
	order: SemanticInvocationOrder,
	candidates: SemanticEvaluationCandidate[],
	classified: ClassifiedSelection,
): SemanticInvocationTrace {
	const result = classified.result;
	const outcome = result?.outcome ?? "selected";
	const classification = classified.selectedId
		? classified.selectedId === testCase.expectedEvidenceId
			? "correct"
			: "wrong"
		: "non_selection";
	return {
		caseId: testCase.caseId,
		order,
		candidateCount: candidates.length,
		candidates: labels(candidates).map((candidate, index) => ({
			label: candidate.label,
			evidenceId: candidates[index]!.id,
		})),
		outcome,
		...(outcome === "selected" && result ? { selection: result.selection } : {}),
		...(classified.selectedId ? { mappedEvidenceId: classified.selectedId } : {}),
		expectedEvidenceId: testCase.expectedEvidenceId,
		classification,
		...(result?.observation
			? {
					rawOutputShape: result.observation.rawOutputShape,
					rawOutputSha256: result.observation.rawOutputSha256,
					rawOutputLength: result.observation.rawOutputLength,
				}
			: {}),
		...(classified.elapsedMs === undefined ? {} : { elapsedMs: classified.elapsedMs }),
	};
}

export function latencyStatistics(traces: SemanticInvocationTrace[]): SemanticLatencyStatistics {
	const values = traces
		.map((trace) => trace.elapsedMs)
		.filter((elapsedMs): elapsedMs is number => elapsedMs !== undefined)
		.sort((left, right) => left - right);
	if (values.length === 0) return { minMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 };
	const nearestRank = (percentile: number) => values[Math.max(0, Math.ceil(percentile * values.length) - 1)]!;
	return { minMs: values[0]!, p50Ms: nearestRank(0.5), p95Ms: nearestRank(0.95), maxMs: values.at(-1)! };
}

function emptyOutcomeCounts(): SemanticOutcomeCounts {
	return { selected: 0, abstained: 0, invalid: 0, timeout: 0, providerError: 0 };
}

export function summarizeTraces(traces: SemanticInvocationTrace[]): SemanticTraceSummary {
	const summary: SemanticTraceSummary = {
		primary: emptyOutcomeCounts(),
		reversed: emptyOutcomeCounts(),
		rawOutputShapes: {},
		correct: 0,
		wrong: 0,
		nonSelection: 0,
	};
	for (const trace of traces) {
		const outcomes = trace.order === "primary" ? summary.primary : summary.reversed;
		if (trace.outcome === "provider_error") outcomes.providerError += 1;
		else outcomes[trace.outcome] += 1;
		if (trace.rawOutputShape)
			summary.rawOutputShapes[trace.rawOutputShape] = (summary.rawOutputShapes[trace.rawOutputShape] ?? 0) + 1;
		if (trace.classification === "correct") summary.correct += 1;
		else if (trace.classification === "wrong") summary.wrong += 1;
		else summary.nonSelection += 1;
	}
	return summary;
}

export async function runSemanticSelectionEvaluation(
	cases: SemanticEvaluationCase[],
	selector: SemanticEvidenceSelector,
	options: SemanticEvaluationOptions = {},
): Promise<SemanticEvaluationResult> {
	let semanticCalls = 0;
	let correct = 0;
	let wrong = 0;
	let selected = 0;
	let abstained = 0;
	let multiCorrect = 0;
	let multiWrong = 0;
	let orderRobustCorrect = 0;
	let orderInducedWrong = 0;
	const traces: SemanticInvocationTrace[] = [];
	const multi = cases.filter((testCase) => testCase.candidates.length >= 2);
	for (const testCase of cases) {
		const primary = await classify(testCase, testCase.candidates, selector);
		if (testCase.candidates.length >= 2) {
			semanticCalls += 1;
			const trace = createTrace(testCase, "primary", testCase.candidates, primary);
			await options.onInvocationComplete?.(trace);
			traces.push(trace);
		}
		if (primary.selectedId) {
			selected += 1;
			if (primary.selectedId === testCase.expectedEvidenceId) correct += 1;
			else wrong += 1;
		} else {
			abstained += 1;
		}
		if (testCase.candidates.length < 2) continue;
		if (primary.selectedId === testCase.expectedEvidenceId) multiCorrect += 1;
		if (primary.selectedId && primary.selectedId !== testCase.expectedEvidenceId) multiWrong += 1;
		const reversedCandidates = [...testCase.candidates].reverse();
		const alternate = await classify(testCase, reversedCandidates, selector);
		semanticCalls += 1;
		const trace = createTrace(testCase, "reversed", reversedCandidates, alternate);
		await options.onInvocationComplete?.(trace);
		traces.push(trace);
		if (primary.selectedId === testCase.expectedEvidenceId && alternate.selectedId === testCase.expectedEvidenceId) {
			orderRobustCorrect += 1;
		}
		if (
			(primary.selectedId === testCase.expectedEvidenceId || primary.selectedId === undefined) &&
			alternate.selectedId !== undefined &&
			alternate.selectedId !== testCase.expectedEvidenceId
		) {
			orderInducedWrong += 1;
		}
	}
	const metrics = {
		correctSelectionRate: rate(correct, cases.length),
		wrongSelectionRate: rate(wrong, cases.length),
		answerableCoverage: rate(selected, cases.length),
		selectedEvidencePrecision: rate(correct, selected),
		abstentionRate: rate(abstained, cases.length),
		invalidSelectorOutputRate: rate(traces.filter((trace) => trace.outcome === "invalid").length, semanticCalls),
		providerErrorRate: rate(traces.filter((trace) => trace.outcome === "provider_error").length, semanticCalls),
		timeoutRate: rate(traces.filter((trace) => trace.outcome === "timeout").length, semanticCalls),
		multiCandidateSemanticAccuracy: rate(multiCorrect, multi.length),
		multiCandidateWrongSelectionRate: rate(multiWrong, multi.length),
		orderRobustCorrectSelectionRate: rate(orderRobustCorrect, multi.length),
		orderInducedWrongSelectionRate: rate(orderInducedWrong, multi.length),
	};
	return {
		semanticCalls,
		metrics,
		traces,
		traceSummary: summarizeTraces(traces),
		latency: latencyStatistics(traces),
		gatePassed:
			metrics.correctSelectionRate >= 0.98 &&
			metrics.wrongSelectionRate === 0 &&
			metrics.answerableCoverage >= 0.95 &&
			metrics.selectedEvidencePrecision >= 0.98 &&
			metrics.multiCandidateWrongSelectionRate === 0 &&
			metrics.invalidSelectorOutputRate === 0 &&
			metrics.orderInducedWrongSelectionRate === 0,
	};
}

function expectedTraceCandidates(
	testCase: SemanticEvaluationCase,
	order: SemanticInvocationOrder,
): Array<{ label: SemanticSelectionCandidate["label"]; evidenceId: string }> {
	const candidates = order === "primary" ? testCase.candidates : [...testCase.candidates].reverse();
	return labels(candidates).map((candidate, index) => ({ label: candidate.label, evidenceId: candidates[index]!.id }));
}

function matchesExpectedTrace(
	trace: PersistedSemanticInvocationTrace,
	testCase: SemanticEvaluationCase,
): string | undefined {
	if (!Number.isSafeInteger(trace.sequence) || trace.sequence < 1) return "has an invalid sequence";
	if (trace.expectedEvidenceId !== testCase.expectedEvidenceId) return "has a mismatched expected evidence id";
	const expectedCandidates = expectedTraceCandidates(testCase, trace.order);
	if (trace.candidateCount !== expectedCandidates.length) return "has a mismatched candidate count";
	if (
		trace.candidates.length !== expectedCandidates.length ||
		trace.candidates.some(
			(candidate, index) =>
				candidate.label !== expectedCandidates[index]!.label ||
				candidate.evidenceId !== expectedCandidates[index]!.evidenceId,
		)
	)
		return "has a mismatched candidate mapping";
	if (trace.outcome === "selected") {
		if (!trace.selection || trace.selection === "ABSTAIN" || !trace.mappedEvidenceId)
			return "records a selected outcome without a mapped selection";
		const mapped = trace.candidates.find((candidate) => candidate.label === trace.selection)?.evidenceId;
		if (mapped !== trace.mappedEvidenceId) return "records an inconsistent label mapping";
		const expectedClassification = trace.mappedEvidenceId === testCase.expectedEvidenceId ? "correct" : "wrong";
		if (trace.classification !== expectedClassification) return "records an inconsistent selection classification";
	} else if (trace.classification !== "non_selection" || trace.mappedEvidenceId !== undefined) {
		return "records an inconsistent non-selection";
	}
	if (trace.elapsedMs !== undefined && (!Number.isFinite(trace.elapsedMs) || trace.elapsedMs < 0))
		return "has an invalid elapsed time";
	return undefined;
}

function gatePassed(metrics: SemanticSelectionMetrics): boolean {
	return (
		metrics.correctSelectionRate >= 0.98 &&
		metrics.wrongSelectionRate === 0 &&
		metrics.answerableCoverage >= 0.95 &&
		metrics.selectedEvidencePrecision >= 0.98 &&
		metrics.multiCandidateWrongSelectionRate === 0 &&
		metrics.invalidSelectorOutputRate === 0 &&
		metrics.orderInducedWrongSelectionRate === 0
	);
}

/**
 * Rebuilds official Gate metrics only from a complete, unique persisted trace set.
 * Incomplete or malformed journals deliberately return no metrics, never inferred values.
 */
export function reconstructSemanticSelectionEvaluation(
	cases: SemanticEvaluationCase[],
	persistedTraces: PersistedSemanticInvocationTrace[],
): ReconstructedSemanticSelectionEvaluation {
	const multi = cases.filter((testCase) => testCase.candidates.length >= 2);
	const expectedSemanticCalls = multi.length * 2;
	const traceByInvocation = new Map<string, PersistedSemanticInvocationTrace>();
	const sequences = new Set<number>();
	const knownCases = new Map(cases.map((testCase) => [testCase.caseId, testCase]));
	let reason: string | undefined;
	for (const trace of persistedTraces) {
		const testCase = knownCases.get(trace.caseId);
		if (!testCase || testCase.candidates.length < 2) {
			reason = `unknown or single-candidate trace for ${trace.caseId}`;
			break;
		}
		const key = `${trace.caseId}\u0000${trace.order}`;
		if (traceByInvocation.has(key)) {
			reason = `duplicate persisted trace for ${trace.caseId}/${trace.order}`;
			break;
		}
		if (sequences.has(trace.sequence)) {
			reason = `duplicate persisted trace sequence ${trace.sequence}`;
			break;
		}
		const mismatch = matchesExpectedTrace(trace, testCase);
		if (mismatch) {
			reason = `persisted trace ${trace.caseId}/${trace.order} ${mismatch}`;
			break;
		}
		traceByInvocation.set(key, trace);
		sequences.add(trace.sequence);
	}
	if (!reason && traceByInvocation.size !== expectedSemanticCalls)
		reason = `expected ${expectedSemanticCalls} persisted semantic traces, found ${traceByInvocation.size}`;
	if (!reason) {
		for (const testCase of multi) {
			if (
				!traceByInvocation.has(`${testCase.caseId}\u0000primary`) ||
				!traceByInvocation.has(`${testCase.caseId}\u0000reversed`)
			) {
				reason = `missing persisted trace for ${testCase.caseId}`;
				break;
			}
		}
	}
	if (!reason) {
		const sortedBySequence = [...traceByInvocation.values()].sort((left, right) => left.sequence - right.sequence);
		for (const [index, trace] of sortedBySequence.entries()) {
			if (trace.sequence !== index + 1) {
				reason = `persisted trace sequences are not contiguous from 1; found ${trace.sequence} at position ${index + 1}`;
				break;
			}
		}
	}
	if (reason)
		return {
			status: "infrastructure_blocked",
			expectedSemanticCalls,
			persistedSemanticCalls: persistedTraces.length,
			uniqueInvocationCount: traceByInvocation.size,
			reason,
			gatePassed: false,
		};

	let correct = 0;
	let wrong = 0;
	let selected = 0;
	let abstained = 0;
	let multiCorrect = 0;
	let multiWrong = 0;
	let orderRobustCorrect = 0;
	let orderInducedWrong = 0;
	for (const testCase of cases) {
		if (testCase.candidates.length === 1) {
			selected += 1;
			correct += 1;
			continue;
		}
		const primary = traceByInvocation.get(`${testCase.caseId}\u0000primary`)!;
		const reversed = traceByInvocation.get(`${testCase.caseId}\u0000reversed`)!;
		const primarySelectedId = primary.outcome === "selected" ? primary.mappedEvidenceId : undefined;
		const reversedSelectedId = reversed.outcome === "selected" ? reversed.mappedEvidenceId : undefined;
		if (primarySelectedId) {
			selected += 1;
			if (primarySelectedId === testCase.expectedEvidenceId) correct += 1;
			else wrong += 1;
		} else {
			abstained += 1;
		}
		if (primarySelectedId === testCase.expectedEvidenceId) multiCorrect += 1;
		if (primarySelectedId && primarySelectedId !== testCase.expectedEvidenceId) multiWrong += 1;
		if (primarySelectedId === testCase.expectedEvidenceId && reversedSelectedId === testCase.expectedEvidenceId)
			orderRobustCorrect += 1;
		if (
			(primarySelectedId === testCase.expectedEvidenceId || primarySelectedId === undefined) &&
			reversedSelectedId !== undefined &&
			reversedSelectedId !== testCase.expectedEvidenceId
		)
			orderInducedWrong += 1;
	}
	const traces = [...traceByInvocation.values()]
		.sort((left, right) => left.sequence - right.sequence)
		.map(({ sequence: _sequence, ...trace }) => trace);
	const semanticCalls = traces.length;
	const metrics = {
		correctSelectionRate: rate(correct, cases.length),
		wrongSelectionRate: rate(wrong, cases.length),
		answerableCoverage: rate(selected, cases.length),
		selectedEvidencePrecision: rate(correct, selected),
		abstentionRate: rate(abstained, cases.length),
		invalidSelectorOutputRate: rate(traces.filter((trace) => trace.outcome === "invalid").length, semanticCalls),
		providerErrorRate: rate(traces.filter((trace) => trace.outcome === "provider_error").length, semanticCalls),
		timeoutRate: rate(traces.filter((trace) => trace.outcome === "timeout").length, semanticCalls),
		multiCandidateSemanticAccuracy: rate(multiCorrect, multi.length),
		multiCandidateWrongSelectionRate: rate(multiWrong, multi.length),
		orderRobustCorrectSelectionRate: rate(orderRobustCorrect, multi.length),
		orderInducedWrongSelectionRate: rate(orderInducedWrong, multi.length),
	};
	return {
		status: "complete",
		expectedSemanticCalls,
		persistedSemanticCalls: persistedTraces.length,
		uniqueInvocationCount: traceByInvocation.size,
		metrics,
		traces,
		traceSummary: summarizeTraces(traces),
		latency: latencyStatistics(traces),
		gatePassed: gatePassed(metrics),
	};
}
