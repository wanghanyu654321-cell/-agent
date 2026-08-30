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
}

export interface SemanticEvaluationResult {
	semanticCalls: number;
	metrics: SemanticSelectionMetrics;
	traces: SemanticInvocationTrace[];
	traceSummary: SemanticTraceSummary;
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

type ClassifiedSelection = { selectedId?: string; result?: SemanticSelectionResult };

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
	const result = await selector.select({ query: testCase.query, candidates: labelled }, new AbortController().signal);
	if (result.outcome !== "selected") return { result };
	const index = labelled.findIndex((candidate) => candidate.label === result.selection);
	return index < 0
		? { result: { ...result, selection: "ABSTAIN", outcome: "invalid" } }
		: { selectedId: candidates[index]!.id, result };
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
	};
}

function emptyOutcomeCounts(): SemanticOutcomeCounts {
	return { selected: 0, abstained: 0, invalid: 0, timeout: 0, providerError: 0 };
}

function summarizeTraces(traces: SemanticInvocationTrace[]): SemanticTraceSummary {
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
			traces.push(createTrace(testCase, "primary", testCase.candidates, primary));
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
		traces.push(createTrace(testCase, "reversed", reversedCandidates, alternate));
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
