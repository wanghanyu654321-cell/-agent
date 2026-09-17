import { describe, expect, it } from "vitest";
import { GovernedKnowledgeRetrievalService, type KnowledgeEntry } from "../src/knowledge.ts";
import { isRetrievalQualityGatePassed, type RetrievalEvalCase, runRetrievalEvaluation } from "../src/retrieval-eval.ts";

const entries: KnowledgeEntry[] = [
	{
		id: "controlled-alpha",
		kind: "policy",
		status: "synthetic_test_only",
		title: "controlled alpha",
		content: "CONTROLLED_ALPHA_EVIDENCE",
		version: "test-v1",
		updatedAt: "2026-08-28",
		sourceRef: "test://controlled-alpha",
		tags: ["alpha", "controlled"],
	},
	{
		id: "controlled-beta",
		kind: "policy",
		status: "synthetic_test_only",
		title: "controlled beta",
		content: "CONTROLLED_BETA_EVIDENCE",
		version: "test-v1",
		updatedAt: "2026-08-28",
		sourceRef: "test://controlled-beta",
		tags: ["beta", "controlled"],
	},
	{
		id: "controlled-tenant-only",
		kind: "policy",
		status: "synthetic_test_only",
		title: "controlled scoped",
		content: "CONTROLLED_SCOPED_EVIDENCE",
		version: "test-v1",
		updatedAt: "2026-08-28",
		sourceRef: "test://controlled-tenant-only",
		tags: ["scoped", "controlled"],
		tenantScope: "tenant-a",
	},
];

const cases: RetrievalEvalCase[] = [
	{
		caseId: "controlled-alpha-direct",
		query: "alpha",
		tenantId: "tenant-a",
		storeId: "store-a",
		expectedAnswerable: true,
		expectedEvidenceIds: ["controlled-alpha"],
		queryProvenance: "SYNTHETIC_QUERY",
		category: "controlled",
		difficulty: "direct",
	},
	{
		caseId: "controlled-beta-direct",
		query: "beta",
		tenantId: "tenant-a",
		storeId: "store-a",
		expectedAnswerable: true,
		expectedEvidenceIds: ["controlled-beta"],
		queryProvenance: "SYNTHETIC_QUERY",
		category: "controlled",
		difficulty: "direct",
	},
	{
		caseId: "controlled-no-answer",
		query: "absent",
		tenantId: "tenant-a",
		storeId: "store-a",
		expectedAnswerable: false,
		expectedEvidenceIds: [],
		queryProvenance: "SYNTHETIC_QUERY",
		category: "no-answer",
		difficulty: "direct",
	},
	{
		caseId: "controlled-cross-tenant",
		query: "scoped",
		tenantId: "tenant-b",
		storeId: "store-a",
		expectedAnswerable: false,
		expectedEvidenceIds: [],
		queryProvenance: "SYNTHETIC_QUERY",
		category: "scope",
		difficulty: "scope",
		scopeExpectation: "tenant",
	},
];

describe("V2.1 retrieval-quality evaluator", () => {
	it("measures deterministic Top-1, Recall@3, no-answer rejection, and scope isolation through RetrievalService", async () => {
		const retrieval = new GovernedKnowledgeRetrievalService(entries, { allowSyntheticTestFixtures: true });
		const first = await runRetrievalEvaluation(retrieval, cases);
		const second = await runRetrievalEvaluation(retrieval, cases);

		expect(first.results).toEqual(second.results);
		expect(first.metrics).toMatchObject({
			top1HitRate: 1,
			recallAt3: 1,
			noAnswerCorrectRejectionRate: 1,
			wrongEvidenceRate: 0,
			crossTenantLeakageRate: 0,
			crossStoreLeakageRate: 0,
			unauthorizedKnowledgeExposureRate: 0,
		});
		expect(isRetrievalQualityGatePassed(first.metrics)).toBe(true);
	});

	it("does not pass the quality gate when a required quality metric falls below its threshold", () => {
		expect(
			isRetrievalQualityGatePassed({
				top1HitRate: 0.84,
				recallAt3: 1,
				mrr: 1,
				noAnswerCorrectRejectionRate: 1,
				wrongEvidenceRate: 0,
				evidencePrecision: 1,
				extraneousEvidenceRate: 0,
				meanReturnedEvidenceCount: 1,
				crossTenantLeakageRate: 0,
				crossStoreLeakageRate: 0,
				unauthorizedKnowledgeExposureRate: 0,
				queryProvenanceBreakdown: {},
				categoryBreakdown: {},
				difficultyBreakdown: {},
			}),
		).toBe(false);
	});
});

describe("retrieval MRR and difficulty breakdown", () => {
	const rankedRetrieval = (rankings: Record<string, string[]>) => ({
		search: async (query: string) => (rankings[query] ?? []).map((id) => ({ id, text: `stub evidence ${id}` })),
	});

	const answerableCase = (
		caseId: string,
		query: string,
		expectedEvidenceIds: string[],
		difficulty: string,
	): RetrievalEvalCase => ({
		caseId,
		query,
		tenantId: "tenant-a",
		storeId: "store-a",
		expectedAnswerable: true,
		expectedEvidenceIds,
		queryProvenance: "SYNTHETIC_QUERY",
		category: "controlled",
		difficulty,
	});

	it("scores a relevant rank-1 result as reciprocal rank 1", async () => {
		const evaluation = await runRetrievalEvaluation(rankedRetrieval({ "rank-1": ["gold", "noise"] }), [
			answerableCase("mrr-rank-1", "rank-1", ["gold"], "direct"),
		]);
		expect(evaluation.metrics.mrr).toBe(1);
	});

	it("scores rank 2 and rank 3 hits as 1/2 and 1/3", async () => {
		const evaluation = await runRetrievalEvaluation(
			rankedRetrieval({ "rank-2": ["noise", "gold"], "rank-3": ["noise", "noise", "gold"] }),
			[
				answerableCase("mrr-rank-2", "rank-2", ["gold"], "direct"),
				answerableCase("mrr-rank-3", "rank-3", ["gold"], "customer-variant"),
			],
		);
		expect(evaluation.metrics.mrr).toBeCloseTo((1 / 2 + 1 / 3) / 2);
	});

	it("contributes 0 when no expected evidence is retrieved", async () => {
		const evaluation = await runRetrievalEvaluation(rankedRetrieval({ miss: ["noise"], empty: [] }), [
			answerableCase("mrr-miss", "miss", ["gold"], "direct"),
			answerableCase("mrr-empty-result", "empty", ["gold"], "direct"),
		]);
		expect(evaluation.metrics.mrr).toBe(0);
	});

	it("uses the best rank across multiple expected evidence ids", async () => {
		const evaluation = await runRetrievalEvaluation(rankedRetrieval({ multi: ["noise", "gold-b", "gold-a"] }), [
			answerableCase("mrr-multi-gold", "multi", ["gold-a", "gold-b"], "direct"),
		]);
		expect(evaluation.metrics.mrr).toBe(1 / 2);
	});

	it("aggregates difficultyBreakdown per stratum with the same rate shape as the other breakdowns", async () => {
		const evaluation = await runRetrievalEvaluation(
			rankedRetrieval({ "direct-hit": ["gold"], "variant-miss": ["noise"], absent: [] }),
			[
				answerableCase("difficulty-direct-hit", "direct-hit", ["gold"], "direct"),
				answerableCase("difficulty-variant-miss", "variant-miss", ["gold"], "customer-variant"),
				{
					...answerableCase("difficulty-fail-closed-reject", "absent", [], "fail-closed"),
					expectedAnswerable: false,
				},
			],
		);
		expect(evaluation.metrics.difficultyBreakdown).toEqual({
			"customer-variant": 0,
			direct: 1,
			"fail-closed": 1,
		});
	});

	it("returns mrr 0 and an empty difficultyBreakdown for an empty case set", async () => {
		const evaluation = await runRetrievalEvaluation(rankedRetrieval({}), []);
		expect(evaluation.metrics.mrr).toBe(0);
		expect(evaluation.metrics.difficultyBreakdown).toEqual({});
	});
});
