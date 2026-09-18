import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	createPiSemanticEvidenceSelector,
	SEMANTIC_SELECTOR_PROMPT_VERSION,
	SEMANTIC_SELECTOR_SYSTEM_PROMPT,
} from "../../../src/semantic-selector.ts";
import {
	createDurableSemanticGateAttempt,
	type DurableSemanticGatePaths,
	type DurableSemanticTraceJournal,
	readDurableSemanticGateTraces,
	resumeDurableSemanticGateAttempt,
	writeFinalSemanticGateReportOnce,
} from "./durable-journal.ts";
import {
	evidencePackHashV21,
	holdoutCasesHashV21,
	loadHoldoutEvidenceV21,
	loadHoldoutV21,
	validateHoldoutV21,
} from "./holdout-v2.1/holdout.ts";
import {
	type HoldoutV21EvaluationCase,
	reconstructHoldoutV21Evaluation,
	runHoldoutV21Evaluation,
} from "./holdout-v2.1-evaluation.ts";
import { bootstrapOAuthAwareModelRuntime } from "./oauth-aware-runtime.ts";
import { hashFrozenPrompt, resolveSourceCommit } from "./run-oauth-aware-gate.ts";

export const HOLDOUT_V21_TIMEOUT_MS = 15_000;
export const HOLDOUT_V21_FROZEN_COMMIT = "1c0ebd44128a32a98cc3ed1fca915fcd88a2e764";
export const HOLDOUT_V21_ATTEMPT_MANIFEST = "unseen-holdout-v2-1-attempt-manifest.json";
export const HOLDOUT_V21_TRACES = "unseen-holdout-v2-1-traces.jsonl";
export const HOLDOUT_V21_REPORT = "unseen-holdout-v2-1-run.json";
const PROVIDER = "openai-codex";
const MODEL = "gpt-5.6-sol";
const PROMPT_VERSION = "v2.3.0";
const PROMPT_HASH = "ac4831b003263bf8aea76dd13f535808f84a39306055402ac1f99725707acf4f";

class InfrastructureStop extends Error {}

type FrozenManifest = {
	evidencePackSha256: string;
	casesSha256: string;
	promptVersion: string;
	promptHash: string;
	futureTotalCalls: number;
};

function paths(reportsDirectory: string): DurableSemanticGatePaths {
	return {
		manifestPath: join(reportsDirectory, HOLDOUT_V21_ATTEMPT_MANIFEST),
		journalPath: join(reportsDirectory, HOLDOUT_V21_TRACES),
		finalReportPath: join(reportsDirectory, HOLDOUT_V21_REPORT),
	};
}

export function buildHoldoutV21EvaluationCases(): {
	cases: HoldoutV21EvaluationCase[];
	evidenceHash: string;
	casesHash: string;
} {
	const evidence = loadHoldoutEvidenceV21();
	const cases = loadHoldoutV21();
	validateHoldoutV21(cases, evidence);
	const evidenceById = new Map(evidence.map((entry) => [entry.evidenceId, entry]));
	return {
		cases: cases.map((testCase) => ({
			caseId: testCase.caseId,
			query: testCase.query,
			expectedSelection: testCase.expectedSelection,
			candidates: testCase.candidateEvidenceIds.map((evidenceId) => {
				const entry = evidenceById.get(evidenceId);
				if (!entry) throw new Error(`Holdout V2.1 case references missing evidence: ${evidenceId}`);
				return { id: entry.evidenceId, title: entry.title, content: entry.content };
			}),
		})),
		evidenceHash: evidencePackHashV21(),
		casesHash: holdoutCasesHashV21(),
	};
}

function readFrozenManifest(): FrozenManifest {
	return JSON.parse(
		readFileSync(join(import.meta.dirname, "holdout-v2.1", "holdout-freeze-manifest.json"), "utf8"),
	) as FrozenManifest;
}

function assertFrozenConfiguration(provider: string | undefined, model: string | undefined): void {
	if (provider !== PROVIDER || model !== MODEL) throw new Error(`Set frozen provider/model to ${PROVIDER}/${MODEL}.`);
	if (
		SEMANTIC_SELECTOR_PROMPT_VERSION !== PROMPT_VERSION ||
		hashFrozenPrompt(SEMANTIC_SELECTOR_SYSTEM_PROMPT) !== PROMPT_HASH
	)
		throw new Error("Frozen selector prompt or prompt version changed.");
}

function assertManifestMatches(
	manifest: Record<string, unknown>,
	sourceCommit: string,
	evidenceHash: string,
	casesHash: string,
): void {
	if (
		manifest.provider !== PROVIDER ||
		manifest.model !== MODEL ||
		manifest.promptVersion !== PROMPT_VERSION ||
		manifest.promptHash !== PROMPT_HASH ||
		manifest.holdoutEvidenceSha256 !== evidenceHash ||
		manifest.holdoutCasesSha256 !== casesHash ||
		manifest.holdoutFrozenCommit !== HOLDOUT_V21_FROZEN_COMMIT ||
		manifest.evaluationSourceCommit !== sourceCommit ||
		manifest.evaluationTimeoutMs !== HOLDOUT_V21_TIMEOUT_MS ||
		manifest.expectedSemanticCalls !== 48
	)
		throw new Error("Existing V2.1 attempt manifest does not match this frozen evaluation configuration.");
}

function persistedInfrastructureFailure(
	traces: ReturnType<typeof readDurableSemanticGateTraces>["traces"],
): string | undefined {
	const trace = traces.find(
		(item) => item.outcome === "provider_error" || item.outcome === "timeout" || item.outcome === "invalid",
	);
	return trace
		? `Persisted ${trace.outcome} at ${trace.caseId}/${trace.order}; this first-exposure attempt cannot retry.`
		: undefined;
}

function latency(traces: ReturnType<typeof readDurableSemanticGateTraces>["traces"]) {
	const values = traces
		.map((trace) => trace.elapsedMs)
		.filter((value): value is number => value !== undefined)
		.sort((left, right) => left - right);
	if (values.length === 0) return { minMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 };
	const percentile = (fraction: number) => values[Math.max(0, Math.ceil(values.length * fraction) - 1)]!;
	return { minMs: values[0]!, p50Ms: percentile(0.5), p95Ms: percentile(0.95), maxMs: values.at(-1)! };
}

async function main(): Promise<void> {
	const provider = process.env.SEMANTIC_SELECTOR_PROVIDER;
	const modelId = process.env.SEMANTIC_SELECTOR_MODEL;
	assertFrozenConfiguration(provider, modelId);
	const frozen = readFrozenManifest();
	const { cases, evidenceHash, casesHash } = buildHoldoutV21EvaluationCases();
	if (
		frozen.evidencePackSha256 !== evidenceHash ||
		frozen.casesSha256 !== casesHash ||
		frozen.promptVersion !== PROMPT_VERSION ||
		frozen.promptHash !== PROMPT_HASH ||
		frozen.futureTotalCalls !== 48
	)
		throw new Error("Holdout V2.1 raw-byte freeze manifest does not match its inputs.");
	const bootstrap = await bootstrapOAuthAwareModelRuntime(PROVIDER, MODEL);
	if (!bootstrap.authConfigured) throw new Error("Pi OAuth is not configured for the frozen provider.");
	const reports = join(import.meta.dirname, "reports");
	mkdirSync(reports, { recursive: true });
	const attemptPaths = paths(reports);
	if (existsSync(attemptPaths.finalReportPath))
		throw new Error("The V2.1 Gate report already exists and will not be overwritten.");
	const sourceCommit = resolveSourceCommit();
	let journal: DurableSemanticTraceJournal;
	let persisted = [] as ReturnType<typeof readDurableSemanticGateTraces>["traces"];
	if (existsSync(attemptPaths.manifestPath) || existsSync(attemptPaths.journalPath)) {
		if (!existsSync(attemptPaths.manifestPath) || !existsSync(attemptPaths.journalPath))
			throw new Error("A partial durable attempt identity exists and cannot be resumed.");
		assertManifestMatches(
			JSON.parse(readFileSync(attemptPaths.manifestPath, "utf8")) as Record<string, unknown>,
			sourceCommit,
			evidenceHash,
			casesHash,
		);
		const resumed = resumeDurableSemanticGateAttempt(attemptPaths);
		journal = resumed.journal;
		persisted = resumed.traces;
	} else {
		journal = createDurableSemanticGateAttempt(attemptPaths, {
			kind: "V2_3_TRUE_UNSEEN_HOLDOUT_V2_1_ATTEMPT",
			attemptId: "v2.3-true-unseen-holdout-v2.1-first-exposure",
			createdAt: new Date().toISOString(),
			status: "running",
			provider: PROVIDER,
			model: MODEL,
			promptVersion: PROMPT_VERSION,
			promptHash: PROMPT_HASH,
			holdoutEvidenceSha256: evidenceHash,
			holdoutCasesSha256: casesHash,
			holdoutFrozenCommit: HOLDOUT_V21_FROZEN_COMMIT,
			evaluationSourceCommit: sourceCommit,
			evaluationTimeoutMs: HOLDOUT_V21_TIMEOUT_MS,
			expectedSemanticCalls: 48,
		});
	}
	const priorFailure = persistedInfrastructureFailure(persisted);
	if (priorFailure) {
		journal.close();
		throw new Error(priorFailure);
	}
	let sequence = persisted.length;
	let infrastructureFailure: string | undefined;
	try {
		await runHoldoutV21Evaluation(
			cases,
			createPiSemanticEvidenceSelector(bootstrap.model, bootstrap.completionRuntime, HOLDOUT_V21_TIMEOUT_MS),
			{
				existingTraces: persisted.map(({ sequence: _sequence, ...trace }) => trace),
				onInvocationComplete(trace) {
					sequence += 1;
					journal.append({ ...trace, sequence });
					if (trace.outcome === "provider_error" || trace.outcome === "timeout" || trace.outcome === "invalid") {
						infrastructureFailure = `${trace.outcome} at ${trace.caseId}/${trace.order}`;
						throw new InfrastructureStop(infrastructureFailure);
					}
				},
			},
		);
	} catch (error) {
		if (!(error instanceof InfrastructureStop)) throw error;
	} finally {
		journal.close();
	}
	const recovered = readDurableSemanticGateTraces(attemptPaths.journalPath);
	const reconstruction = reconstructHoldoutV21Evaluation(cases, recovered.traces);
	const complete = reconstruction.status === "complete";
	const report = {
		kind: "V2_3_TRUE_UNSEEN_HOLDOUT_V2_1_RUN",
		provider: PROVIDER,
		model: MODEL,
		promptVersion: PROMPT_VERSION,
		promptHash: PROMPT_HASH,
		holdoutEvidenceSha256: evidenceHash,
		holdoutCasesSha256: casesHash,
		holdoutFrozenCommit: HOLDOUT_V21_FROZEN_COMMIT,
		evaluationSourceCommit: sourceCommit,
		executedAt: new Date().toISOString(),
		evaluationTimeoutMs: HOLDOUT_V21_TIMEOUT_MS,
		expectedSemanticCalls: 48,
		actualSemanticCalls: recovered.traces.length,
		journalPath: HOLDOUT_V21_TRACES,
		journalRecordCount: recovered.traces.length,
		journalIncompleteTrailingLine: recovered.incompleteTrailingLine,
		journalSequenceRange:
			recovered.traces.length === 0
				? null
				: {
						first: Math.min(...recovered.traces.map((trace) => trace.sequence)),
						last: Math.max(...recovered.traces.map((trace) => trace.sequence)),
					},
		latency: latency(recovered.traces),
		metrics: complete ? reconstruction.metrics : undefined,
		traces: complete ? reconstruction.traces : undefined,
		gateStatus:
			infrastructureFailure || !complete
				? "infrastructure_blocked"
				: reconstruction.gatePassed
					? "passed"
					: "failed",
		gatePassed: !infrastructureFailure && complete && reconstruction.gatePassed,
		infrastructureReason: infrastructureFailure ?? reconstruction.reason,
	};
	writeFinalSemanticGateReportOnce(attemptPaths.finalReportPath, report);
	console.log(JSON.stringify(report, null, 2));
	if (!report.gatePassed) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("run-holdout-v2-1-gate.ts")) await main();
