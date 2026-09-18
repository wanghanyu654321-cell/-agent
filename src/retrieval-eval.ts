import type { RetrievalService } from "./index.ts";

export type RetrievalQueryProvenance = "PUBLIC_REAL_CASE" | "HUMAN_AUTHORED" | "SYNTHETIC_QUERY";

export interface RetrievalEvalCase {
	caseId: string;
	query: string;
	tenantId: string;
	storeId: string;
	expectedAnswerable: boolean;
	expectedEvidenceIds: string[];
	queryProvenance: RetrievalQueryProvenance;
	category: string;
	difficulty: string;
	scopeExpectation?: "tenant" | "store";
	provenanceSourceRef?: string;
	queryDisclosure?: "paraphrased" | "synthetic" | "human_authored";
}

export interface RetrievalEvalResult {
	caseId: string;
	queryProvenance: RetrievalQueryProvenance;
	category: string;
	difficulty: string;
	expectedAnswerable: boolean;
	expectedEvidenceIds: string[];
	actualEvidenceIds: string[];
	top1Hit: boolean;
	recallAt3Hit: boolean;
	noAnswerRejected: boolean;
	wrongEvidence: boolean;
	unauthorizedKnowledgeExposure: boolean;
}

export interface RetrievalQualityMetrics {
	top1HitRate: number;
	recallAt3: number;
	/**
	 * Mean reciprocal rank over answerable cases only: each case contributes the
	 * reciprocal of the 1-based rank of the first expected evidence id present in
	 * the ordered actualEvidenceIds (best rank over the expected-id set); complete
	 * misses contribute 0. Report-only metric — no acceptance threshold.
	 */
	mrr: number;
	noAnswerCorrectRejectionRate: number;
	/** Complete retrieval misses only; extraneous evidence is measured separately. */
	wrongEvidenceRate: number;
	evidencePrecision: number;
	extraneousEvidenceRate: number;
	meanReturnedEvidenceCount: number;
	crossTenantLeakageRate: number;
	crossStoreLeakageRate: number;
	unauthorizedKnowledgeExposureRate: number;
	queryProvenanceBreakdown: Record<string, number>;
	categoryBreakdown: Record<string, number>;
	difficultyBreakdown: Record<string, number>;
}

function rate<T>(items: T[], predicate: (item: T) => boolean): number {
	return items.filter(predicate).length / Math.max(1, items.length);
}

/**
 * Reciprocal rank for one answerable case: 1 divided by the 1-based rank of the
 * first expected evidence id present in the ordered actualEvidenceIds. With a
 * set-valued gold (multiple expected ids) the best (smallest) rank over the
 * expected set is used — the standard conservative MRR reading for set-gold
 * retrieval — and a complete miss contributes 0.
 */
function reciprocalRank(result: RetrievalEvalResult): number {
	for (let rank = 1; rank <= result.actualEvidenceIds.length; rank++) {
		if (result.expectedEvidenceIds.includes(result.actualEvidenceIds[rank - 1])) return 1 / rank;
	}
	return 0;
}

function breakdown(
	results: RetrievalEvalResult[],
	key: "queryProvenance" | "category" | "difficulty",
): Record<string, number> {
	const groups = new Map<string, RetrievalEvalResult[]>();
	for (const result of results) {
		const group = result[key];
		groups.set(group, [...(groups.get(group) ?? []), result]);
	}
	return Object.fromEntries(
		[...groups.entries()]
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([group, items]) => [
				group,
				rate(items, (item) => (item.expectedAnswerable ? item.recallAt3Hit : item.noAnswerRejected)),
			]),
	);
}

export async function runRetrievalEvaluation(
	retrieval: RetrievalService,
	cases: RetrievalEvalCase[],
): Promise<{ results: RetrievalEvalResult[]; metrics: RetrievalQualityMetrics }> {
	const results: RetrievalEvalResult[] = [];
	for (const testCase of cases) {
		const evidence = await retrieval.search(testCase.query, new AbortController().signal, {
			tenantId: testCase.tenantId,
			storeId: testCase.storeId,
		});
		const actualEvidenceIds = evidence.map((item) => item.id);
		const top3 = actualEvidenceIds.slice(0, 3);
		const top1Hit = testCase.expectedAnswerable && testCase.expectedEvidenceIds.includes(actualEvidenceIds[0] ?? "");
		const recallAt3Hit = testCase.expectedAnswerable && top3.some((id) => testCase.expectedEvidenceIds.includes(id));
		const noAnswerRejected = !testCase.expectedAnswerable && actualEvidenceIds.length === 0;
		const wrongEvidence =
			(testCase.expectedAnswerable && actualEvidenceIds.length > 0 && !recallAt3Hit) ||
			(!testCase.expectedAnswerable && actualEvidenceIds.length > 0);
		results.push({
			caseId: testCase.caseId,
			queryProvenance: testCase.queryProvenance,
			category: testCase.category,
			difficulty: testCase.difficulty,
			expectedAnswerable: testCase.expectedAnswerable,
			expectedEvidenceIds: [...testCase.expectedEvidenceIds],
			actualEvidenceIds,
			top1Hit,
			recallAt3Hit,
			noAnswerRejected,
			wrongEvidence,
			unauthorizedKnowledgeExposure: !testCase.expectedAnswerable && actualEvidenceIds.length > 0,
		});
	}
	const answerable = results.filter((result) => result.expectedAnswerable);
	const noAnswer = results.filter((result) => !result.expectedAnswerable);
	const returnedEvidence = answerable.flatMap((result) => result.actualEvidenceIds);
	const goldEvidence = answerable.flatMap((result) =>
		result.actualEvidenceIds.filter((id) => result.expectedEvidenceIds.includes(id)),
	);
	const evidencePrecision = goldEvidence.length / Math.max(1, returnedEvidence.length);
	const crossTenant = results.filter(
		(result) => cases.find((item) => item.caseId === result.caseId)?.scopeExpectation === "tenant",
	);
	const crossStore = results.filter(
		(result) => cases.find((item) => item.caseId === result.caseId)?.scopeExpectation === "store",
	);
	return {
		results,
		metrics: {
			top1HitRate: rate(answerable, (result) => result.top1Hit),
			recallAt3: rate(answerable, (result) => result.recallAt3Hit),
			mrr: answerable.reduce((sum, result) => sum + reciprocalRank(result), 0) / Math.max(1, answerable.length),
			noAnswerCorrectRejectionRate: rate(noAnswer, (result) => result.noAnswerRejected),
			wrongEvidenceRate: rate(results, (result) => result.wrongEvidence),
			evidencePrecision,
			extraneousEvidenceRate: 1 - evidencePrecision,
			meanReturnedEvidenceCount: returnedEvidence.length / Math.max(1, answerable.length),
			crossTenantLeakageRate: rate(crossTenant, (result) => !result.noAnswerRejected),
			crossStoreLeakageRate: rate(crossStore, (result) => !result.noAnswerRejected),
			unauthorizedKnowledgeExposureRate: rate(noAnswer, (result) => result.unauthorizedKnowledgeExposure),
			queryProvenanceBreakdown: breakdown(results, "queryProvenance"),
			categoryBreakdown: breakdown(results, "category"),
			difficultyBreakdown: breakdown(results, "difficulty"),
		},
	};
}

export function isRetrievalQualityGatePassed(metrics: RetrievalQualityMetrics): boolean {
	return (
		metrics.top1HitRate >= 0.85 &&
		metrics.recallAt3 >= 0.95 &&
		metrics.noAnswerCorrectRejectionRate >= 0.95 &&
		metrics.wrongEvidenceRate <= 0.05 &&
		metrics.crossTenantLeakageRate === 0 &&
		metrics.crossStoreLeakageRate === 0 &&
		metrics.unauthorizedKnowledgeExposureRate === 0
	);
}
