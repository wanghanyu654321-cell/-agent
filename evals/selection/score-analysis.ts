import { GovernedKnowledgeRetrievalService } from "../../src/knowledge.ts";
import { loadPublicBenchmarkEntries, publicBenchmarkCases } from "../retrieval/public-benchmark.ts";

export interface CandidateMarginObservation {
	caseId: string;
	expectedEvidenceId: string;
	topEvidenceId: string;
	top1IsExpected: boolean;
	margin?: number;
}

export interface MarginThresholdResult {
	selected: number;
	correct: number;
	wrong: number;
	coverage: number;
	correctSelectionRate: number;
}

/**
 * Test/evaluation-only analysis of the existing V2.1.1 candidate scores.
 * It neither changes retrieval ranking nor supplies a runtime selector.
 */
export async function analyzeCandidateMargins(): Promise<CandidateMarginObservation[]> {
	const retrieval = new GovernedKnowledgeRetrievalService(loadPublicBenchmarkEntries(), { rankByRelevance: true });
	const answerableCases = publicBenchmarkCases.filter((testCase) => testCase.expectedAnswerable);
	return Promise.all(
		answerableCases.map(async (testCase) => {
			const candidates = await retrieval.search(testCase.query, new AbortController().signal, {
				tenantId: testCase.tenantId,
				storeId: testCase.storeId,
			});
			const top = candidates[0];
			if (!top?.relevance) throw new Error(`Expected ranked evidence for ${testCase.caseId}.`);
			const second = candidates[1];
			if (second && !second.relevance) throw new Error(`Expected ranked secondary evidence for ${testCase.caseId}.`);
			return {
				caseId: testCase.caseId,
				expectedEvidenceId: testCase.expectedEvidenceIds[0]!,
				topEvidenceId: top.id,
				top1IsExpected: testCase.expectedEvidenceIds.includes(top.id),
				...(second ? { margin: top.relevance.score - second.relevance!.score } : {}),
			};
		}),
	);
}

/**
 * Evaluates the complete generalized monotonic margin family documented for
 * the V2.2 failure decision. This is analysis evidence only, not product code.
 */
export function evaluateMarginThreshold(
	observations: CandidateMarginObservation[],
	threshold: number,
): MarginThresholdResult {
	const selected = observations.filter(
		(observation) => observation.margin === undefined || observation.margin >= threshold,
	);
	const correct = selected.filter((observation) => observation.top1IsExpected).length;
	return {
		selected: selected.length,
		correct,
		wrong: selected.length - correct,
		coverage: selected.length / Math.max(1, observations.length),
		correctSelectionRate: correct / Math.max(1, observations.length),
	};
}
