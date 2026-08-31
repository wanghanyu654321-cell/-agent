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
	writeFinalSemanticGateReportOnce,
} from "./durable-journal.ts";
import {
	type HoldoutV21EvaluationCase,
	reconstructHoldoutV21Evaluation,
	runHoldoutV21Evaluation,
} from "./holdout-v2.1-evaluation.ts";
import {
	evidencePackHashV22,
	holdoutCasesHashV22,
	loadHoldoutEvidenceV22,
	loadHoldoutV22,
	validateHoldoutV22,
} from "./holdout-v2.2-boundary/holdout.ts";
import { bootstrapOAuthAwareModelRuntime } from "./oauth-aware-runtime.ts";
import { hashFrozenPrompt, resolveSourceCommit } from "./run-oauth-aware-gate.ts";

export const HOLDOUT_V22_TIMEOUT_MS = 15_000;
export const HOLDOUT_V22_FROZEN_COMMIT = "e34e82847bb1e2465924e34c043d5e492d4dde2f";
export const HOLDOUT_V22_ATTEMPT_MANIFEST = "sufficiency-boundary-v2-2-attempt-manifest.json";
export const HOLDOUT_V22_TRACES = "sufficiency-boundary-v2-2-traces.jsonl";
export const HOLDOUT_V22_REPORT = "sufficiency-boundary-v2-2-run.json";
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
		manifestPath: join(reportsDirectory, HOLDOUT_V22_ATTEMPT_MANIFEST),
		journalPath: join(reportsDirectory, HOLDOUT_V22_TRACES),
		finalReportPath: join(reportsDirectory, HOLDOUT_V22_REPORT),
	};
}

export function buildHoldoutV22EvaluationCases(): {
	cases: HoldoutV21EvaluationCase[];
	evidenceHash: string;
	casesHash: string;
} {
	const evidence = loadHoldoutEvidenceV22();
	const cases = loadHoldoutV22();
	validateHoldoutV22(cases, evidence);
	const evidenceById = new Map(evidence.map((entry) => [entry.evidenceId, entry]));
	return {
		cases: cases.map((testCase) => ({
			caseId: testCase.caseId,
			query: testCase.query,
			expectedSelection: testCase.expectedSelection,
			candidates: testCase.candidateEvidenceIds.map((evidenceId) => {
				const entry = evidenceById.get(evidenceId);
				if (!entry) throw new Error(`Holdout V2.2 case references missing evidence: ${evidenceId}`);
				return { id: entry.evidenceId, title: entry.title, content: entry.content };
			}),
		})),
		evidenceHash: evidencePackHashV22(),
		casesHash: holdoutCasesHashV22(),
	};
}

function readFrozenManifest(): FrozenManifest {
	return JSON.parse(
		readFileSync(join(import.meta.dirname, "holdout-v2.2-boundary", "holdout-freeze-manifest.json"), "utf8"),
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
	assertFrozenConfiguration(process.env.SEMANTIC_SELECTOR_PROVIDER, process.env.SEMANTIC_SELECTOR_MODEL);
	const frozen = readFrozenManifest();
	const { cases, evidenceHash, casesHash } = buildHoldoutV22EvaluationCases();
	if (
		frozen.evidencePackSha256 !== evidenceHash ||
		frozen.casesSha256 !== casesHash ||
		frozen.promptVersion !== PROMPT_VERSION ||
		frozen.promptHash !== PROMPT_HASH ||
		frozen.futureTotalCalls !== 24
	)
		throw new Error("Holdout V2.2 raw-byte freeze manifest does not match its inputs.");
	const reports = join(import.meta.dirname, "reports");
	mkdirSync(reports, { recursive: true });
	const attemptPaths = paths(reports);
	if (
		existsSync(attemptPaths.manifestPath) ||
		existsSync(attemptPaths.journalPath) ||
		existsSync(attemptPaths.finalReportPath)
	)
		throw new Error("The V2.2 first-exposure attempt identity already exists and cannot be replayed.");
	const bootstrap = await bootstrapOAuthAwareModelRuntime(PROVIDER, MODEL);
	if (!bootstrap.authConfigured) throw new Error("Pi OAuth is not configured for the frozen provider.");
	const sourceCommit = resolveSourceCommit();
	const journal: DurableSemanticTraceJournal = createDurableSemanticGateAttempt(attemptPaths, {
		kind: "V2_3_SUFFICIENCY_BOUNDARY_HOLDOUT_V2_2_ATTEMPT",
		attemptId: "v2.3-sufficiency-boundary-v2-2-first-exposure",
		createdAt: new Date().toISOString(),
		status: "running",
		provider: PROVIDER,
		model: MODEL,
		promptVersion: PROMPT_VERSION,
		promptHash: PROMPT_HASH,
		holdoutEvidenceSha256: evidenceHash,
		holdoutCasesSha256: casesHash,
		holdoutFrozenCommit: HOLDOUT_V22_FROZEN_COMMIT,
		evaluationSourceCommit: sourceCommit,
		evaluationTimeoutMs: HOLDOUT_V22_TIMEOUT_MS,
		expectedSemanticCalls: 24,
	});
	let sequence = 0;
	let infrastructureFailure: string | undefined;
	try {
		await runHoldoutV21Evaluation(
			cases,
			createPiSemanticEvidenceSelector(bootstrap.model, bootstrap.completionRuntime, HOLDOUT_V22_TIMEOUT_MS),
			{
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
		kind: "V2_3_SUFFICIENCY_BOUNDARY_HOLDOUT_V2_2_RUN",
		provider: PROVIDER,
		model: MODEL,
		promptVersion: PROMPT_VERSION,
		promptHash: PROMPT_HASH,
		holdoutEvidenceSha256: evidenceHash,
		holdoutCasesSha256: casesHash,
		holdoutFrozenCommit: HOLDOUT_V22_FROZEN_COMMIT,
		evaluationSourceCommit: sourceCommit,
		executedAt: new Date().toISOString(),
		evaluationTimeoutMs: HOLDOUT_V22_TIMEOUT_MS,
		expectedSemanticCalls: 24,
		actualSemanticCalls: recovered.traces.length,
		journalPath: HOLDOUT_V22_TRACES,
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

if (process.argv[1]?.endsWith("run-holdout-v2-2-boundary-gate.ts")) await main();
