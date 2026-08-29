import type {
	SemanticEvidenceSelector,
	SemanticSelectionCandidate,
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

export interface SemanticEvaluationResult {
	semanticCalls: number;
	metrics: SemanticSelectionMetrics;
	gatePassed: boolean;
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
		? { result: { selection: "ABSTAIN", outcome: "invalid" } }
		: { selectedId: candidates[index]!.id, result };
}

function rate(numerator: number, denominator: number): number {
	return numerator / Math.max(1, denominator);
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
	let invalid = 0;
	let multiCorrect = 0;
	let multiWrong = 0;
	let orderRobustCorrect = 0;
	let orderInducedWrong = 0;
	const multi = cases.filter((testCase) => testCase.candidates.length >= 2);
	for (const testCase of cases) {
		const primary = await classify(testCase, testCase.candidates, selector);
		if (testCase.candidates.length >= 2) semanticCalls += 1;
		if (primary.selectedId) {
			selected += 1;
			if (primary.selectedId === testCase.expectedEvidenceId) correct += 1;
			else wrong += 1;
		} else {
			abstained += 1;
			if (primary.result?.outcome === "invalid") invalid += 1;
		}
		if (testCase.candidates.length < 2) continue;
		if (primary.selectedId === testCase.expectedEvidenceId) multiCorrect += 1;
		if (primary.selectedId && primary.selectedId !== testCase.expectedEvidenceId) multiWrong += 1;
		const alternate = await classify(testCase, [...testCase.candidates].reverse(), selector);
		semanticCalls += 1;
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
		invalidSelectorOutputRate: rate(invalid, semanticCalls),
		multiCandidateSemanticAccuracy: rate(multiCorrect, multi.length),
		multiCandidateWrongSelectionRate: rate(multiWrong, multi.length),
		orderRobustCorrectSelectionRate: rate(orderRobustCorrect, multi.length),
		orderInducedWrongSelectionRate: rate(orderInducedWrong, multi.length),
	};
	return {
		semanticCalls,
		metrics,
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
