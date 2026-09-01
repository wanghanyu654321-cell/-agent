import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GovernedKnowledgeRetrievalService } from "../../../src/knowledge.ts";
import { createPiSemanticEvidenceSelector, SEMANTIC_SELECTOR_PROMPT_VERSION } from "../../../src/semantic-selector.ts";
import { loadPublicBenchmarkEntries, publicBenchmarkCases } from "../../retrieval/public-benchmark.ts";
import { runSemanticSelectionEvaluation } from "./evaluation.ts";
import { bootstrapOAuthAwareModelRuntime } from "./oauth-aware-runtime.ts";

const provider = process.env.SEMANTIC_SELECTOR_PROVIDER;
const modelId = process.env.SEMANTIC_SELECTOR_MODEL;
const reports = join(import.meta.dirname, "reports");
const first = join(reports, "first-real-run.json");
const ioContractRun = join(reports, "io-contract-run.json");
if (!existsSync(first)) {
	console.error("REAL_MODEL_EVAL_BLOCKED: first-real-run.json is required and must remain immutable.");
	process.exitCode = 1;
} else if (existsSync(ioContractRun)) {
	console.error("REAL_MODEL_EVAL_BLOCKED: io-contract-run.json already exists and will not be overwritten.");
	process.exitCode = 1;
} else if (!provider || !modelId) {
	console.error(
		"REAL_MODEL_EVAL_BLOCKED: set SEMANTIC_SELECTOR_PROVIDER and SEMANTIC_SELECTOR_MODEL with provider credentials.",
	);
	process.exitCode = 1;
} else {
	const bootstrap = await bootstrapOAuthAwareModelRuntime(provider, modelId);
	if (!bootstrap.authConfigured) {
		console.error("REAL_MODEL_EVAL_BLOCKED: Pi OAuth credential resolution is not configured for this provider.");
		process.exitCode = 1;
	} else {
		const entries = loadPublicBenchmarkEntries();
		const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
		const retrieval = new GovernedKnowledgeRetrievalService(entries, { rankByRelevance: true });
		const cases = await Promise.all(
			publicBenchmarkCases
				.filter((testCase) => testCase.expectedAnswerable)
				.map(async (testCase) => ({
					caseId: testCase.caseId,
					query: testCase.query,
					expectedEvidenceId: testCase.expectedEvidenceIds[0]!,
					candidates: (
						await retrieval.search(testCase.query, new AbortController().signal, {
							tenantId: testCase.tenantId,
							storeId: testCase.storeId,
						})
					).map((candidate) => {
						const entry = entriesById.get(candidate.id);
						if (!entry) throw new Error(`Missing governed entry for ${candidate.id}.`);
						return { id: candidate.id, title: entry.title, content: candidate.text };
					}),
				})),
		);
		const evaluation = await runSemanticSelectionEvaluation(
			cases,
			createPiSemanticEvidenceSelector(bootstrap.model, bootstrap.completionRuntime),
		);
		const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
		const report = {
			kind: "V2_3_REAL_MODEL_SELECTION_RUN",
			provider,
			model: modelId,
			promptVersion: SEMANTIC_SELECTOR_PROMPT_VERSION,
			benchmarkHash: hash(publicBenchmarkCases),
			corpusHash: hash(entries),
			executedAt: new Date().toISOString(),
			...evaluation,
		};
		mkdirSync(reports, { recursive: true });
		writeFileSync(ioContractRun, `${JSON.stringify(report, null, 2)}\n`);
		console.log(JSON.stringify(report, null, 2));
		if (!evaluation.gatePassed) process.exitCode = 1;
	}
}
