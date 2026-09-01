import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
	createPiSemanticEvidenceSelector,
	SEMANTIC_SELECTOR_PROMPT_VERSION,
	SEMANTIC_SELECTOR_SYSTEM_PROMPT,
} from "../../../src/semantic-selector.ts";
import {
	createDurableSemanticGateAttempt,
	type DurableSemanticGateAttemptManifest,
	type DurableSemanticGatePaths,
	type DurableSemanticTraceJournal,
	readDurableSemanticGateTraces,
	resumeDurableSemanticGateAttempt,
	writeFinalSemanticGateReportOnce,
} from "./durable-journal.ts";
import type { PersistedSemanticInvocationTrace } from "./evaluation.ts";
import {
	type HoldoutV21EvaluationCase,
	type HoldoutV21Metrics,
	reconstructHoldoutV21Evaluation,
	runHoldoutV21Evaluation,
} from "./holdout-v2.1-evaluation.ts";
import {
	evidencePackHashV231Final,
	FINAL_UNSEEN_GATE_V231,
	type FinalBoundaryType,
	holdoutCasesHashV231Final,
	loadHoldoutEvidenceV231Final,
	loadHoldoutV231Final,
	validateHoldoutV231Final,
} from "./holdout-v2.3.1-final/holdout.ts";
import { bootstrapOAuthAwareModelRuntime } from "./oauth-aware-runtime.ts";
import { hashFrozenPrompt, resolveSourceCommit } from "./run-oauth-aware-gate.ts";

export const FINAL_V231_PROVIDER = "openai-codex";
export const FINAL_V231_MODEL = "gpt-5.6-sol";
export const FINAL_V231_TIMEOUT_MS = 15_000;
export const FINAL_V231_EXPECTED_SEMANTIC_CALLS = 24;
export const FINAL_V231_FROZEN_HOLDOUT_COMMIT = "001ee12fb2f04c335f75a05f6b54546c89fe5cc9";
export const FINAL_V231_ATTEMPT_MANIFEST = "final-v2-3-1-true-unseen-attempt-manifest.json";
export const FINAL_V231_TRACES = "final-v2-3-1-true-unseen-traces.jsonl";
export const FINAL_V231_REPORT = "final-v2-3-1-true-unseen-run.json";
const FINAL_V231_PROMPT_VERSION = "v2.3.1";
const FINAL_V231_PROMPT_HASH = "fabf617ce6ecd9cc4f91cd68e42c789f1c0be629297e046a3c782fe6bfe29869";

class InfrastructureStop extends Error {}

type HoldoutFreezeManifest = {
	promptVersion: string;
	promptSha256: string;
	evidencePackSha256: string;
	casesSha256: string;
	futureTotalCalls: number;
	provider: string;
	model: string;
	evaluationTimeoutMs: number;
};

type FinalV231Population = {
	cases: HoldoutV21EvaluationCase[];
	evidenceHash: string;
	casesHash: string;
	boundaryByCase: Map<string, FinalBoundaryType>;
};

type FinalV231Preflight = {
	provider: string | undefined;
	model: string | undefined;
	sourceCommit: string;
	isAncestor: (ancestor: string, descendant: string) => boolean;
};

type DirectOrderSummary = { correct: number; wrong: number; abstain: number };
type AbstainOrderSummary = { abstain: number; unsupportedSelection: number };

export type FinalV231Segments = {
	clearDirectAnswer: { primary: DirectOrderSummary; reversed: DirectOrderSummary };
	trueInsufficiency: { primary: AbstainOrderSummary; reversed: AbstainOrderSummary };
	hardRelatedInsufficient: { primary: AbstainOrderSummary; reversed: AbstainOrderSummary };
};

function paths(reportsDirectory: string): DurableSemanticGatePaths {
	return {
		manifestPath: join(reportsDirectory, FINAL_V231_ATTEMPT_MANIFEST),
		journalPath: join(reportsDirectory, FINAL_V231_TRACES),
		finalReportPath: join(reportsDirectory, FINAL_V231_REPORT),
	};
}

function readFreezeManifest(): HoldoutFreezeManifest {
	return JSON.parse(
		readFileSync(join(import.meta.dirname, "holdout-v2.3.1-final", "holdout-freeze-manifest.json"), "utf8"),
	) as HoldoutFreezeManifest;
}

export function buildFinalV231EvaluationCases(): FinalV231Population {
	const evidence = loadHoldoutEvidenceV231Final();
	const cases = loadHoldoutV231Final();
	validateHoldoutV231Final(cases, evidence);
	const evidenceById = new Map(evidence.map((entry) => [entry.evidenceId, entry]));
	return {
		cases: cases.map((testCase) => ({
			caseId: testCase.caseId,
			query: testCase.query,
			expectedSelection: testCase.expectedSelection,
			candidates: testCase.candidateEvidenceIds.map((evidenceId) => {
				const entry = evidenceById.get(evidenceId);
				if (!entry) throw new Error(`Final V2.3.1 case references missing evidence: ${evidenceId}`);
				return { id: entry.evidenceId, title: entry.title, content: entry.content };
			}),
		})),
		evidenceHash: evidencePackHashV231Final(),
		casesHash: holdoutCasesHashV231Final(),
		boundaryByCase: new Map(cases.map((testCase) => [testCase.caseId, testCase.boundaryType])),
	};
}

function frozenInputsMatch(population: FinalV231Population): boolean {
	const manifest = readFreezeManifest();
	return (
		manifest.evidencePackSha256 === population.evidenceHash &&
		manifest.casesSha256 === population.casesHash &&
		manifest.promptVersion === FINAL_V231_PROMPT_VERSION &&
		manifest.promptSha256 === FINAL_V231_PROMPT_HASH &&
		manifest.futureTotalCalls === FINAL_V231_EXPECTED_SEMANTIC_CALLS &&
		manifest.provider === FINAL_V231_PROVIDER &&
		manifest.model === FINAL_V231_MODEL &&
		manifest.evaluationTimeoutMs === FINAL_V231_TIMEOUT_MS
	);
}

/** Throws before any provider bootstrap when a frozen input or provenance precondition changes. */
export function assertFinalV231FrozenConfiguration(preflight: FinalV231Preflight): void {
	if (preflight.provider !== FINAL_V231_PROVIDER || preflight.model !== FINAL_V231_MODEL)
		throw new Error(`Set frozen provider/model to ${FINAL_V231_PROVIDER}/${FINAL_V231_MODEL}.`);
	if (
		SEMANTIC_SELECTOR_PROMPT_VERSION !== FINAL_V231_PROMPT_VERSION ||
		hashFrozenPrompt(SEMANTIC_SELECTOR_SYSTEM_PROMPT) !== FINAL_V231_PROMPT_HASH
	)
		throw new Error("Frozen V2.3.1 selector prompt or prompt version changed.");
	const population = buildFinalV231EvaluationCases();
	if (!frozenInputsMatch(population))
		throw new Error("Final V2.3.1 raw-byte freeze manifest does not match its inputs.");
	if (!preflight.isAncestor(FINAL_V231_FROZEN_HOLDOUT_COMMIT, preflight.sourceCommit))
		throw new Error("Final V2.3.1 frozen Holdout ancestry is not present in evaluation source.");
}

function isAncestor(ancestor: string, descendant: string, repositoryDirectory = process.cwd()): boolean {
	const repository = resolve(repositoryDirectory);
	try {
		execFileSync(
			"git",
			[
				"-c",
				`safe.directory=${repository.replaceAll("\\", "/")}`,
				"merge-base",
				"--is-ancestor",
				ancestor,
				descendant,
			],
			{
				cwd: repository,
				stdio: "ignore",
			},
		);
		return true;
	} catch {
		return false;
	}
}

function directOrder(): DirectOrderSummary {
	return { correct: 0, wrong: 0, abstain: 0 };
}

function abstainOrder(): AbstainOrderSummary {
	return { abstain: 0, unsupportedSelection: 0 };
}

export function summarizeFinalV231Segments(
	boundaryByCase: Map<string, FinalBoundaryType>,
	traces: PersistedSemanticInvocationTrace[],
): FinalV231Segments {
	const segments: FinalV231Segments = {
		clearDirectAnswer: { primary: directOrder(), reversed: directOrder() },
		trueInsufficiency: { primary: abstainOrder(), reversed: abstainOrder() },
		hardRelatedInsufficient: { primary: abstainOrder(), reversed: abstainOrder() },
	};
	for (const trace of traces) {
		const boundary = boundaryByCase.get(trace.caseId);
		if (!boundary) continue;
		if (boundary === "CLEAR_DIRECT_ANSWER") {
			const order = segments.clearDirectAnswer[trace.order];
			if (trace.classification === "correct") order.correct += 1;
			else if (trace.outcome === "abstained") order.abstain += 1;
			else order.wrong += 1;
			continue;
		}
		const order =
			boundary === "TRUE_INSUFFICIENCY"
				? segments.trueInsufficiency[trace.order]
				: segments.hardRelatedInsufficient[trace.order];
		if (trace.outcome === "abstained") order.abstain += 1;
		else if (trace.outcome === "selected") order.unsupportedSelection += 1;
	}
	return segments;
}

function exactGatePassed(segments: FinalV231Segments, metrics: HoldoutV21Metrics): boolean {
	return (
		segments.clearDirectAnswer.primary.correct === FINAL_UNSEEN_GATE_V231.clearDirectAnswerPrimary.correct &&
		segments.clearDirectAnswer.primary.wrong === 0 &&
		segments.clearDirectAnswer.primary.abstain === 0 &&
		segments.clearDirectAnswer.reversed.correct === FINAL_UNSEEN_GATE_V231.clearDirectAnswerReversed.correct &&
		segments.clearDirectAnswer.reversed.wrong === 0 &&
		segments.clearDirectAnswer.reversed.abstain === 0 &&
		segments.trueInsufficiency.primary.abstain === FINAL_UNSEEN_GATE_V231.trueInsufficiencyPrimary.correct &&
		segments.trueInsufficiency.primary.unsupportedSelection === 0 &&
		segments.trueInsufficiency.reversed.abstain === FINAL_UNSEEN_GATE_V231.trueInsufficiencyReversed.correct &&
		segments.trueInsufficiency.reversed.unsupportedSelection === 0 &&
		segments.hardRelatedInsufficient.primary.abstain ===
			FINAL_UNSEEN_GATE_V231.hardRelatedInsufficientPrimary.correct &&
		segments.hardRelatedInsufficient.primary.unsupportedSelection === 0 &&
		segments.hardRelatedInsufficient.reversed.abstain ===
			FINAL_UNSEEN_GATE_V231.hardRelatedInsufficientReversed.correct &&
		segments.hardRelatedInsufficient.reversed.unsupportedSelection === 0 &&
		metrics !== undefined &&
		metrics.invalid === 0 &&
		metrics.providerError === 0 &&
		metrics.timeout === 0 &&
		metrics.orderInducedWrong === 0 &&
		metrics.orderInducedOutcomeDisagreement === 0
	);
}

function attemptManifest(sourceCommit: string, population: FinalV231Population): DurableSemanticGateAttemptManifest {
	return {
		kind: "V2_3_1_FINAL_TRUE_UNSEEN_GATE_ATTEMPT",
		attemptId: "v2.3.1-final-true-unseen-first-exposure",
		createdAt: new Date().toISOString(),
		status: "running",
		provider: FINAL_V231_PROVIDER,
		model: FINAL_V231_MODEL,
		promptVersion: FINAL_V231_PROMPT_VERSION,
		promptHash: FINAL_V231_PROMPT_HASH,
		holdoutEvidenceSha256: population.evidenceHash,
		holdoutCasesSha256: population.casesHash,
		holdoutFrozenCommit: FINAL_V231_FROZEN_HOLDOUT_COMMIT,
		evaluationSourceCommit: sourceCommit,
		evaluationTimeoutMs: FINAL_V231_TIMEOUT_MS,
		expectedSemanticCalls: FINAL_V231_EXPECTED_SEMANTIC_CALLS,
	};
}

export function assertExistingAttempt(
	manifest: DurableSemanticGateAttemptManifest,
	population: FinalV231Population,
	sourceCommit: string,
): void {
	if (
		manifest.kind !== "V2_3_1_FINAL_TRUE_UNSEEN_GATE_ATTEMPT" ||
		manifest.provider !== FINAL_V231_PROVIDER ||
		manifest.model !== FINAL_V231_MODEL ||
		manifest.promptVersion !== FINAL_V231_PROMPT_VERSION ||
		manifest.promptHash !== FINAL_V231_PROMPT_HASH ||
		manifest.holdoutEvidenceSha256 !== population.evidenceHash ||
		manifest.holdoutCasesSha256 !== population.casesHash ||
		manifest.holdoutFrozenCommit !== FINAL_V231_FROZEN_HOLDOUT_COMMIT ||
		manifest.evaluationSourceCommit !== sourceCommit ||
		manifest.evaluationTimeoutMs !== FINAL_V231_TIMEOUT_MS ||
		manifest.expectedSemanticCalls !== FINAL_V231_EXPECTED_SEMANTIC_CALLS
	)
		throw new Error("Existing final V2.3.1 attempt manifest does not match the frozen Gate identity.");
}

function openAttempt(
	attemptPaths: DurableSemanticGatePaths,
	sourceCommit: string,
	population: FinalV231Population,
): { journal: DurableSemanticTraceJournal; existingTraces: PersistedSemanticInvocationTrace[] } {
	const artifactsExist = [attemptPaths.manifestPath, attemptPaths.journalPath, attemptPaths.finalReportPath].map(
		existsSync,
	);
	if (artifactsExist.every((exists) => !exists))
		return {
			journal: createDurableSemanticGateAttempt(attemptPaths, attemptManifest(sourceCommit, population)),
			existingTraces: [],
		};
	if (artifactsExist[0] && artifactsExist[1] && !artifactsExist[2]) {
		const manifest = JSON.parse(
			readFileSync(attemptPaths.manifestPath, "utf8"),
		) as DurableSemanticGateAttemptManifest;
		assertExistingAttempt(manifest, population, sourceCommit);
		const resumed = resumeDurableSemanticGateAttempt(attemptPaths);
		if (resumed.traces.some((trace) => ["provider_error", "timeout", "invalid"].includes(trace.outcome)))
			throw new Error("An infrastructure outcome is already durable; this Gate cannot replay or resume it.");
		return { journal: resumed.journal, existingTraces: resumed.traces };
	}
	throw new Error(
		"Final V2.3.1 attempt artifacts are incomplete or already finalised; no new attempt may overwrite them.",
	);
}

function latency(traces: PersistedSemanticInvocationTrace[]) {
	const values = traces
		.map((trace) => trace.elapsedMs)
		.filter((value): value is number => value !== undefined)
		.sort((left, right) => left - right);
	if (values.length === 0) return { minMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 };
	const percentile = (fraction: number) => values[Math.max(0, Math.ceil(values.length * fraction) - 1)]!;
	return { minMs: values[0]!, p50Ms: percentile(0.5), p95Ms: percentile(0.95), maxMs: values.at(-1)! };
}

async function main(): Promise<void> {
	const sourceCommit = resolveSourceCommit();
	assertFinalV231FrozenConfiguration({
		provider: process.env.SEMANTIC_SELECTOR_PROVIDER,
		model: process.env.SEMANTIC_SELECTOR_MODEL,
		sourceCommit,
		isAncestor,
	});
	const population = buildFinalV231EvaluationCases();
	const reportsDirectory = join(import.meta.dirname, "reports");
	mkdirSync(reportsDirectory, { recursive: true });
	const attemptPaths = paths(reportsDirectory);
	const bootstrap = await bootstrapOAuthAwareModelRuntime(FINAL_V231_PROVIDER, FINAL_V231_MODEL);
	if (!bootstrap.authConfigured)
		throw new Error("Pi OAuth credential resolution is not configured for the frozen provider.");
	const attempt = openAttempt(attemptPaths, sourceCommit, population);
	let sequence = attempt.existingTraces.length;
	let infrastructureReason: string | undefined;
	try {
		await runHoldoutV21Evaluation(
			population.cases,
			createPiSemanticEvidenceSelector(bootstrap.model, bootstrap.completionRuntime, FINAL_V231_TIMEOUT_MS),
			{
				existingTraces: attempt.existingTraces,
				onInvocationComplete(trace) {
					sequence += 1;
					attempt.journal.append({ ...trace, sequence });
					if (["provider_error", "timeout", "invalid"].includes(trace.outcome)) {
						infrastructureReason = `${trace.outcome} at ${trace.caseId}/${trace.order}`;
						throw new InfrastructureStop(infrastructureReason);
					}
				},
			},
		);
	} catch (error) {
		if (!(error instanceof InfrastructureStop)) throw error;
	} finally {
		attempt.journal.close();
	}
	const recovered = readDurableSemanticGateTraces(attemptPaths.journalPath);
	const reconstruction = reconstructHoldoutV21Evaluation(population.cases, recovered.traces);
	const segments = summarizeFinalV231Segments(population.boundaryByCase, recovered.traces);
	const complete = reconstruction.status === "complete";
	const gatePassed =
		complete && reconstruction.metrics !== undefined && exactGatePassed(segments, reconstruction.metrics);
	const report = {
		kind: "V2_3_1_FINAL_TRUE_UNSEEN_GATE_RUN",
		provider: FINAL_V231_PROVIDER,
		model: FINAL_V231_MODEL,
		promptVersion: FINAL_V231_PROMPT_VERSION,
		promptHash: FINAL_V231_PROMPT_HASH,
		holdoutEvidenceSha256: population.evidenceHash,
		holdoutCasesSha256: population.casesHash,
		holdoutFrozenCommit: FINAL_V231_FROZEN_HOLDOUT_COMMIT,
		evaluationSourceCommit: sourceCommit,
		executedAt: new Date().toISOString(),
		evaluationTimeoutMs: FINAL_V231_TIMEOUT_MS,
		expectedSemanticCalls: FINAL_V231_EXPECTED_SEMANTIC_CALLS,
		actualSemanticCalls: recovered.traces.length,
		journalPath: FINAL_V231_TRACES,
		journalRecordCount: recovered.traces.length,
		journalIncompleteTrailingLine: recovered.incompleteTrailingLine,
		journalSequenceRange:
			recovered.traces.length === 0
				? null
				: {
						first: Math.min(...recovered.traces.map((trace) => trace.sequence)),
						last: Math.max(...recovered.traces.map((trace) => trace.sequence)),
					},
		segments,
		metrics: reconstruction.metrics,
		latency: latency(recovered.traces),
		traces: recovered.traces,
		gateStatus:
			infrastructureReason || reconstruction.status !== "complete"
				? "infrastructure_blocked"
				: gatePassed
					? "passed"
					: "failed",
		gatePassed,
		infrastructureReason: infrastructureReason ?? reconstruction.reason,
	};
	writeFinalSemanticGateReportOnce(attemptPaths.finalReportPath, report);
	console.log(JSON.stringify(report, null, 2));
	if (!gatePassed) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("run-final-v2-3-1-true-unseen-gate.ts")) await main();
