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
			}),
		).toBe(false);
	});
});
