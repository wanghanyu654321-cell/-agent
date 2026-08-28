import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GovernedKnowledgeRetrievalService, type KnowledgeEntry } from "../../src/knowledge.ts";
import {
	isRetrievalQualityGatePassed,
	type RetrievalEvalCase,
	runRetrievalEvaluation,
} from "../../src/retrieval-eval.ts";

const controlledEntries: KnowledgeEntry[] = [
	{
		id: "public-controlled-alpha",
		kind: "policy",
		status: "synthetic_test_only",
		title: "controlled alpha",
		content: "NON-PRODUCTION CONTROLLED ALPHA EVIDENCE",
		version: "public-test-v1",
		updatedAt: "2026-08-28",
		sourceRef: "test://public-controlled-alpha",
		tags: ["alpha", "controlled"],
	},
	{
		id: "public-controlled-beta",
		kind: "policy",
		status: "synthetic_test_only",
		title: "controlled beta",
		content: "NON-PRODUCTION CONTROLLED BETA EVIDENCE",
		version: "public-test-v1",
		updatedAt: "2026-08-28",
		sourceRef: "test://public-controlled-beta",
		tags: ["beta", "controlled"],
	},
	{
		id: "public-controlled-tenant-only",
		kind: "policy",
		status: "synthetic_test_only",
		title: "controlled scoped",
		content: "NON-PRODUCTION CONTROLLED SCOPED EVIDENCE",
		version: "public-test-v1",
		updatedAt: "2026-08-28",
		sourceRef: "test://public-controlled-tenant-only",
		tags: ["scoped", "controlled"],
		tenantScope: "public-tenant-a",
	},
];

const controlledCases: RetrievalEvalCase[] = [
	{
		caseId: "public-alpha",
		query: "alpha",
		tenantId: "public-tenant-a",
		storeId: "public-store-a",
		expectedAnswerable: true,
		expectedEvidenceIds: ["public-controlled-alpha"],
		queryProvenance: "SYNTHETIC_QUERY",
		category: "controlled",
		difficulty: "direct",
	},
	{
		caseId: "public-beta",
		query: "beta",
		tenantId: "public-tenant-a",
		storeId: "public-store-a",
		expectedAnswerable: true,
		expectedEvidenceIds: ["public-controlled-beta"],
		queryProvenance: "SYNTHETIC_QUERY",
		category: "controlled",
		difficulty: "direct",
	},
	{
		caseId: "public-no-answer",
		query: "absent",
		tenantId: "public-tenant-a",
		storeId: "public-store-a",
		expectedAnswerable: false,
		expectedEvidenceIds: [],
		queryProvenance: "SYNTHETIC_QUERY",
		category: "no-answer",
		difficulty: "direct",
	},
	{
		caseId: "public-cross-tenant",
		query: "scoped",
		tenantId: "public-tenant-b",
		storeId: "public-store-a",
		expectedAnswerable: false,
		expectedEvidenceIds: [],
		queryProvenance: "SYNTHETIC_QUERY",
		category: "scope",
		difficulty: "scope",
		scopeExpectation: "tenant",
	},
];

export async function runPublicRetrievalRegression() {
	const retrieval = new GovernedKnowledgeRetrievalService(controlledEntries, { allowSyntheticTestFixtures: true });
	const evaluation = await runRetrievalEvaluation(retrieval, controlledCases);
	return {
		corpusClassification: "SYNTHETIC_FIXTURE" as const,
		queryProvenance: "SYNTHETIC_QUERY" as const,
		gatePassed: isRetrievalQualityGatePassed(evaluation.metrics),
		...evaluation,
	};
}

async function main(): Promise<void> {
	const report = await runPublicRetrievalRegression();
	const reports = join(process.cwd(), "evals", "retrieval", "reports");
	mkdirSync(reports, { recursive: true });
	writeFileSync(join(reports, "public-latest.json"), JSON.stringify(report, null, 2));
	writeFileSync(
		join(reports, "public-latest.md"),
		`# V2.1 Public Sanitized Retrieval Regression\n\nCorpus classification: ${report.corpusClassification}\n\nQuery provenance: ${report.queryProvenance}\n\nGate passed: ${report.gatePassed}\n\nThis report contains no real business knowledge and does not satisfy the Real Knowledge Gate.\n`,
	);
	console.log(JSON.stringify(report));
	if (!report.gatePassed) process.exitCode = 1;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) void main();
