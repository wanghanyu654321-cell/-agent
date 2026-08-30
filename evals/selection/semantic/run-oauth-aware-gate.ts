import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { GovernedKnowledgeRetrievalService } from "../../../src/knowledge.ts";
import {
	createPiSemanticEvidenceSelector,
	SEMANTIC_SELECTOR_PROMPT_VERSION,
	SEMANTIC_SELECTOR_SYSTEM_PROMPT,
} from "../../../src/semantic-selector.ts";
import { loadPublicBenchmarkEntries, publicBenchmarkCases } from "../../retrieval/public-benchmark.ts";
import {
	createDurableSemanticGateAttempt,
	readDurableSemanticGateTraces,
	writeFinalSemanticGateReportOnce,
} from "./durable-journal.ts";
import {
	reconstructSemanticSelectionEvaluation,
	runSemanticSelectionEvaluation,
	type SemanticEvaluationCase,
} from "./evaluation.ts";
import { bootstrapOAuthAwareModelRuntime } from "./oauth-aware-runtime.ts";

export const REAL_MODEL_EVAL_TIMEOUT_MS = 15_000;
export const OAUTH_AWARE_GATE_REPORT = "oauth-aware-semantic-gate-run.json";
export const OAUTH_AWARE_GATE_RECOVERY_ATTEMPT_MANIFEST = "oauth-aware-semantic-gate-recovery-attempt-manifest.json";
export const OAUTH_AWARE_GATE_RECOVERY_TRACES = "oauth-aware-semantic-gate-recovery-traces.jsonl";
export const OAUTH_AWARE_GATE_RECOVERY_REPORT = "oauth-aware-semantic-gate-recovery-run.json";
const PROVIDER = "openai-codex";
const MODEL = "gpt-5.6-sol";
const EXPECTED_PROMPT_VERSION = "v2.3.0";
const EXPECTED_PROMPT_HASH = "ac4831b003263bf8aea76dd13f535808f84a39306055402ac1f99725707acf4f";
const EXPECTED_BENCHMARK_HASH = "af35c7c5467fc4d293626044e4a42edc18e068c07ffb95010192bb6b21651137";
const EXPECTED_CORPUS_HASH = "1aecf6ea0270ad48ce111737c6b6acb57a59006ff69f59257cb1c0f7f3e723af";

export function ensureGateReportDoesNotExist(path: string, exists: (path: string) => boolean = existsSync): void {
	if (exists(path)) throw new Error(`${path} already exists and will not be overwritten.`);
}

function hash(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function hashFrozenPrompt(prompt: string): string {
	return createHash("sha256").update(prompt).digest("hex");
}

async function buildFrozenCases(): Promise<{
	cases: SemanticEvaluationCase[];
	benchmarkHash: string;
	corpusHash: string;
}> {
	const entries = loadPublicBenchmarkEntries();
	const benchmarkHash = hash(publicBenchmarkCases);
	const corpusHash = hash(entries);
	if (benchmarkHash !== EXPECTED_BENCHMARK_HASH || corpusHash !== EXPECTED_CORPUS_HASH)
		throw new Error("Frozen V2.3 benchmark or corpus hash changed.");
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
	const multiCandidateCases = cases.filter((testCase) => testCase.candidates.length >= 2);
	if (cases.length !== 50 || multiCandidateCases.length !== 22)
		throw new Error("Frozen V2.3 evaluation population no longer has 50 answerable and 22 multi-candidate cases.");
	return { cases, benchmarkHash, corpusHash };
}

async function main(): Promise<void> {
	const provider = process.env.SEMANTIC_SELECTOR_PROVIDER;
	const modelId = process.env.SEMANTIC_SELECTOR_MODEL;
	if (provider !== PROVIDER || modelId !== MODEL)
		throw new Error(`Set the frozen semantic Gate provider/model to ${PROVIDER}/${MODEL}.`);
	if (
		SEMANTIC_SELECTOR_PROMPT_VERSION !== EXPECTED_PROMPT_VERSION ||
		hashFrozenPrompt(SEMANTIC_SELECTOR_SYSTEM_PROMPT) !== EXPECTED_PROMPT_HASH
	)
		throw new Error("Frozen V2.3 selector prompt or prompt version changed.");
	const reports = join(import.meta.dirname, "reports");
	const reportPath = join(reports, OAUTH_AWARE_GATE_RECOVERY_REPORT);
	ensureGateReportDoesNotExist(reportPath);
	const { cases, benchmarkHash, corpusHash } = await buildFrozenCases();
	const bootstrap = await bootstrapOAuthAwareModelRuntime(provider, modelId);
	if (!bootstrap.authConfigured)
		throw new Error("Pi OAuth credential resolution is not configured for the frozen provider.");
	mkdirSync(reports, { recursive: true });
	const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
	const journal = createDurableSemanticGateAttempt(
		{
			manifestPath: join(reports, OAUTH_AWARE_GATE_RECOVERY_ATTEMPT_MANIFEST),
			journalPath: join(reports, OAUTH_AWARE_GATE_RECOVERY_TRACES),
			finalReportPath: reportPath,
		},
		{
			kind: "V2_3_OAUTH_AWARE_SEMANTIC_GATE_RECOVERY_ATTEMPT",
			attemptId: "v2.3-oauth-aware-semantic-gate-recovery-1",
			createdAt: new Date().toISOString(),
			status: "running",
			provider,
			model: modelId,
			promptVersion: SEMANTIC_SELECTOR_PROMPT_VERSION,
			promptHash: hashFrozenPrompt(SEMANTIC_SELECTOR_SYSTEM_PROMPT),
			benchmarkHash,
			corpusHash,
			sourceCommit,
			evaluationTimeoutMs: REAL_MODEL_EVAL_TIMEOUT_MS,
			expectedSemanticCalls: 44,
		},
	);
	let sequence = 0;
	try {
		const inMemoryEvaluation = await runSemanticSelectionEvaluation(
			cases,
			createPiSemanticEvidenceSelector(bootstrap.model, bootstrap.completionRuntime, REAL_MODEL_EVAL_TIMEOUT_MS),
			{
				onInvocationComplete(trace) {
					sequence += 1;
					journal.append({ ...trace, sequence });
				},
			},
		);
		if (inMemoryEvaluation.semanticCalls !== 44)
			throw new Error(`Expected exactly 44 semantic calls; got ${inMemoryEvaluation.semanticCalls}.`);
	} finally {
		journal.close();
	}
	const recoveredJournal = readDurableSemanticGateTraces(join(reports, OAUTH_AWARE_GATE_RECOVERY_TRACES));
	if (recoveredJournal.incompleteTrailingLine)
		throw new Error("Recovery journal has an incomplete trailing line; no official Gate report can be produced.");
	const recovery = reconstructSemanticSelectionEvaluation(cases, recoveredJournal.traces);
	if (
		recovery.status !== "complete" ||
		!recovery.metrics ||
		!recovery.traces ||
		!recovery.traceSummary ||
		!recovery.latency
	)
		throw new Error(`Recovery journal is incomplete: ${recovery.reason ?? "unknown recovery failure"}.`);
	if (recovery.expectedSemanticCalls !== 44 || recovery.persistedSemanticCalls !== 44)
		throw new Error(`Expected exactly 44 durable semantic traces; got ${recovery.persistedSemanticCalls}.`);
	const providerErrorCount = recovery.traces.filter((trace) => trace.outcome === "provider_error").length;
	const timeoutCount = recovery.traces.filter((trace) => trace.outcome === "timeout").length;
	const infrastructureBlocked = providerErrorCount > 0 || timeoutCount > 0;
	const report = {
		kind: "V2_3_OAUTH_AWARE_SEMANTIC_GATE_RECOVERY_RUN",
		provider,
		model: modelId,
		promptVersion: SEMANTIC_SELECTOR_PROMPT_VERSION,
		promptHash: hashFrozenPrompt(SEMANTIC_SELECTOR_SYSTEM_PROMPT),
		benchmarkHash,
		corpusHash,
		sourceCommit,
		executedAt: new Date().toISOString(),
		evaluationTimeoutMs: REAL_MODEL_EVAL_TIMEOUT_MS,
		expectedSemanticCalls: recovery.expectedSemanticCalls,
		semanticCalls: recovery.persistedSemanticCalls,
		journalPath: OAUTH_AWARE_GATE_RECOVERY_TRACES,
		journalRecordCount: recovery.persistedSemanticCalls,
		metrics: recovery.metrics,
		latencyMinMs: recovery.latency.minMs,
		latencyP50Ms: recovery.latency.p50Ms,
		latencyP95Ms: recovery.latency.p95Ms,
		latencyMaxMs: recovery.latency.maxMs,
		providerErrorCount,
		timeoutCount,
		traceSummary: recovery.traceSummary,
		traces: recovery.traces,
		gateStatus: infrastructureBlocked ? "infrastructure_blocked" : recovery.gatePassed ? "passed" : "failed",
		gatePassed: !infrastructureBlocked && recovery.gatePassed,
	};
	writeFinalSemanticGateReportOnce(reportPath, report);
	console.log(JSON.stringify(report, null, 2));
	if (!report.gatePassed) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("run-oauth-aware-gate.ts")) {
	await main();
}
