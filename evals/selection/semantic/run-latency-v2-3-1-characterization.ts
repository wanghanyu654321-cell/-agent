import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	createPiSemanticEvidenceSelector,
	SEMANTIC_SELECTOR_PROMPT_VERSION,
	SEMANTIC_SELECTOR_SYSTEM_PROMPT,
	type SemanticSelectionLabel,
	type SemanticSelectionOutcome,
	type SemanticSelectionRawOutputShape,
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
import { buildLatencyPopulationV231, type LatencyInputV231 } from "./latency-v2.3.1/population.ts";
import { bootstrapOAuthAwareModelRuntime } from "./oauth-aware-runtime.ts";
import { hashFrozenPrompt, resolveSourceCommit } from "./run-oauth-aware-gate.ts";

export const LATENCY_V231_PROVIDER = "openai-codex";
export const LATENCY_V231_MODEL = "gpt-5.6-sol";
export const LATENCY_V231_TIMEOUT_MS = 30_000;
export const LATENCY_V231_EXPECTED_CALLS = 30;
export const LATENCY_V231_ATTEMPT_MANIFEST = "latency-v2-3-1-attempt-manifest.json";
export const LATENCY_V231_TRACES = "latency-v2-3-1-traces.jsonl";
export const LATENCY_V231_REPORT = "latency-v2-3-1-report.json";
const PROMPT_VERSION = "v2.3.1";
const PROMPT_HASH = "fabf617ce6ecd9cc4f91cd68e42c789f1c0be629297e046a3c782fe6bfe29869";
const BUDGETS_MS = [2_000, 3_000, 4_000, 5_000, 6_000, 8_000, 10_000, 15_000, 20_000, 30_000] as const;

export type LatencyTraceV231 = {
	sequence: number;
	latencyInputId: string;
	historicalSourceCaseId: string;
	historicalPopulationSource: string;
	round: 1 | 2 | 3;
	candidateCount: number;
	modelInputBytes: number;
	caseId: string;
	order: "primary";
	candidates: Array<{ label: SemanticSelectionLabel; evidenceId: string }>;
	expectedEvidenceId: string;
	outcome: SemanticSelectionOutcome;
	selection: SemanticSelectionLabel | "ABSTAIN";
	mappedEvidenceId?: string;
	classification: "correct" | "wrong" | "non_selection";
	rawOutputShape?: SemanticSelectionRawOutputShape;
	rawOutputSha256?: string;
	rawOutputLength?: number;
	elapsedMs: number;
	timeout: boolean;
	providerError: boolean;
	invalid: boolean;
	matchedHistoricalExpectation: boolean;
};

/** The report aggregates depend only on durable observation fields. */
export type LatencyMetricTraceV231 = Pick<
	LatencyTraceV231,
	"round" | "outcome" | "elapsedMs" | "timeout" | "providerError" | "invalid"
>;

function percentile(values: number[], fraction: number): number {
	return values[Math.max(0, Math.ceil(values.length * fraction) - 1)]!;
}

function latencySummary(values: number[]) {
	const sorted = [...values].sort((left, right) => left - right);
	if (sorted.length === 0)
		return { sampleCount: 0, minMs: 0, meanMs: 0, p50Ms: 0, p75Ms: 0, p90Ms: 0, p95Ms: 0, maxMs: 0 };
	return {
		sampleCount: sorted.length,
		minMs: sorted[0]!,
		meanMs: Math.round(sorted.reduce((total, value) => total + value, 0) / sorted.length),
		p50Ms: percentile(sorted, 0.5),
		p75Ms: percentile(sorted, 0.75),
		p90Ms: percentile(sorted, 0.9),
		p95Ms: percentile(sorted, 0.95),
		maxMs: sorted.at(-1)!,
	};
}

/** Derives every report aggregate from durable traces; no value is hand-authored. */
export function deriveLatencyMetricsV231(
	traces: LatencyMetricTraceV231[],
	scheduledCalls = LATENCY_V231_EXPECTED_CALLS,
) {
	const nonTimeout = traces.filter((trace) => !trace.timeout).map((trace) => trace.elapsedMs);
	return {
		scheduledCalls,
		actualCalls: traces.length,
		successfulResponses: traces.filter((trace) => trace.outcome === "selected" || trace.outcome === "abstained")
			.length,
		timeouts: traces.filter((trace) => trace.timeout).length,
		providerErrors: traces.filter((trace) => trace.providerError).length,
		invalidOutputs: traces.filter((trace) => trace.invalid).length,
		latency: latencySummary(nonTimeout),
		perRound: ([1, 2, 3] as const).map((round) => {
			const values = traces
				.filter((trace) => trace.round === round && !trace.timeout)
				.map((trace) => trace.elapsedMs);
			const summary = latencySummary(values);
			return { round, p50Ms: summary.p50Ms, maxMs: summary.maxMs, sampleCount: summary.sampleCount };
		}),
		counterfactualBudgets: BUDGETS_MS.map((budgetMs) => {
			const exceededCount = traces.filter(
				(trace) => trace.elapsedMs > budgetMs || (trace.timeout && budgetMs < LATENCY_V231_TIMEOUT_MS),
			).length;
			return { budgetMs, exceededCount, exceededRate: traces.length === 0 ? 0 : exceededCount / traces.length };
		}),
	};
}

function paths(reportsDirectory: string): DurableSemanticGatePaths {
	return {
		manifestPath: join(reportsDirectory, LATENCY_V231_ATTEMPT_MANIFEST),
		journalPath: join(reportsDirectory, LATENCY_V231_TRACES),
		finalReportPath: join(reportsDirectory, LATENCY_V231_REPORT),
	};
}

function traceKey(inputId: string, round: number): string {
	return `${inputId}\u0000${round}`;
}

function assertFrozenConfiguration(provider: string | undefined, model: string | undefined): void {
	if (provider !== LATENCY_V231_PROVIDER || model !== LATENCY_V231_MODEL)
		throw new Error(`Set characterization provider/model to ${LATENCY_V231_PROVIDER}/${LATENCY_V231_MODEL}.`);
	if (
		SEMANTIC_SELECTOR_PROMPT_VERSION !== PROMPT_VERSION ||
		hashFrozenPrompt(SEMANTIC_SELECTOR_SYSTEM_PROMPT) !== PROMPT_HASH
	)
		throw new Error("V2.3.1 prompt or prompt version changed.");
}

function attemptManifest(sourceCommit: string, populationHash: string): DurableSemanticGateAttemptManifest {
	return {
		kind: "V2_3_1_LATENCY_CHARACTERIZATION_ATTEMPT",
		attemptId: "v2.3.1-latency-characterization",
		createdAt: new Date().toISOString(),
		status: "running",
		provider: LATENCY_V231_PROVIDER,
		model: LATENCY_V231_MODEL,
		promptVersion: PROMPT_VERSION,
		promptHash: PROMPT_HASH,
		latencyPopulationSha256: populationHash,
		evaluationSourceCommit: sourceCommit,
		observationTimeoutMs: LATENCY_V231_TIMEOUT_MS,
		expectedSemanticCalls: LATENCY_V231_EXPECTED_CALLS,
	};
}

function assertExistingAttempt(
	manifest: DurableSemanticGateAttemptManifest,
	sourceCommit: string,
	populationHash: string,
): void {
	if (
		manifest.kind !== "V2_3_1_LATENCY_CHARACTERIZATION_ATTEMPT" ||
		manifest.provider !== LATENCY_V231_PROVIDER ||
		manifest.model !== LATENCY_V231_MODEL ||
		manifest.promptVersion !== PROMPT_VERSION ||
		manifest.promptHash !== PROMPT_HASH ||
		manifest.latencyPopulationSha256 !== populationHash ||
		manifest.evaluationSourceCommit !== sourceCommit ||
		manifest.observationTimeoutMs !== LATENCY_V231_TIMEOUT_MS ||
		manifest.expectedSemanticCalls !== LATENCY_V231_EXPECTED_CALLS
	)
		throw new Error("Existing latency characterization attempt does not match the frozen identity.");
}

function openAttempt(
	attemptPaths: DurableSemanticGatePaths,
	sourceCommit: string,
	populationHash: string,
): { journal: DurableSemanticTraceJournal; traces: LatencyTraceV231[] } {
	const exists = [attemptPaths.manifestPath, attemptPaths.journalPath, attemptPaths.finalReportPath].map(existsSync);
	if (exists.every((value) => !value))
		return {
			journal: createDurableSemanticGateAttempt(attemptPaths, attemptManifest(sourceCommit, populationHash)),
			traces: [],
		};
	if (exists[0] && exists[1] && !exists[2]) {
		const manifest = JSON.parse(
			readFileSync(attemptPaths.manifestPath, "utf8"),
		) as DurableSemanticGateAttemptManifest;
		assertExistingAttempt(manifest, sourceCommit, populationHash);
		const resumed = resumeDurableSemanticGateAttempt(attemptPaths);
		return { journal: resumed.journal, traces: resumed.traces as LatencyTraceV231[] };
	}
	throw new Error("Latency characterization attempt artifacts cannot be overwritten or replaced.");
}

async function runObservation(
	input: LatencyInputV231,
	round: 1 | 2 | 3,
	sequence: number,
	selector: ReturnType<typeof createPiSemanticEvidenceSelector>,
): Promise<LatencyTraceV231> {
	const labelled = input.candidates.map((candidate, index) => ({
		label: ["A", "B", "C"][index] as SemanticSelectionLabel,
		title: candidate.title,
		content: candidate.content,
	}));
	const startedAt = performance.now();
	const result = await selector.select({ query: input.query, candidates: labelled }, new AbortController().signal);
	const elapsedMs = Math.round(performance.now() - startedAt);
	const mappedEvidenceId =
		result.outcome === "selected"
			? input.candidates[labelled.findIndex((candidate) => candidate.label === result.selection)]?.id
			: undefined;
	const matchedHistoricalExpectation =
		input.historicalExpectedSelection === "ABSTAIN"
			? result.outcome === "abstained"
			: mappedEvidenceId === input.historicalExpectedSelection;
	return {
		sequence,
		latencyInputId: input.latencyInputId,
		historicalSourceCaseId: input.historicalSourceCaseId,
		historicalPopulationSource: input.historicalPopulationSource,
		round,
		candidateCount: labelled.length,
		modelInputBytes: input.modelInputBytes,
		caseId: `${input.latencyInputId}-round-${round}`,
		order: "primary",
		candidates: labelled.map((candidate, index) => ({
			label: candidate.label,
			evidenceId: input.candidates[index]!.id,
		})),
		expectedEvidenceId: input.historicalExpectedSelection,
		outcome: result.outcome,
		selection: result.selection,
		...(mappedEvidenceId ? { mappedEvidenceId } : {}),
		classification: matchedHistoricalExpectation
			? "correct"
			: result.outcome === "selected"
				? "wrong"
				: "non_selection",
		...(result.observation
			? {
					rawOutputShape: result.observation.rawOutputShape,
					rawOutputSha256: result.observation.rawOutputSha256,
					rawOutputLength: result.observation.rawOutputLength,
				}
			: {}),
		elapsedMs,
		timeout: result.outcome === "timeout",
		providerError: result.outcome === "provider_error",
		invalid: result.outcome === "invalid",
		matchedHistoricalExpectation,
	};
}

async function main(): Promise<void> {
	assertFrozenConfiguration(process.env.SEMANTIC_SELECTOR_PROVIDER, process.env.SEMANTIC_SELECTOR_MODEL);
	const sourceCommit = resolveSourceCommit();
	const population = buildLatencyPopulationV231();
	const reportsDirectory = join(import.meta.dirname, "reports");
	mkdirSync(reportsDirectory, { recursive: true });
	const attemptPaths = paths(reportsDirectory);
	const bootstrap = await bootstrapOAuthAwareModelRuntime(LATENCY_V231_PROVIDER, LATENCY_V231_MODEL);
	if (!bootstrap.authConfigured)
		throw new Error("Pi OAuth credential resolution is not configured for the characterization provider.");
	const attempt = openAttempt(attemptPaths, sourceCommit, population.populationHash);
	const traces = [...attempt.traces];
	const seen = new Set(traces.map((trace) => traceKey(trace.latencyInputId, trace.round)));
	let sequence = traces.length;
	try {
		const selector = createPiSemanticEvidenceSelector(
			bootstrap.model,
			bootstrap.completionRuntime,
			LATENCY_V231_TIMEOUT_MS,
		);
		for (const round of [1, 2, 3] as const) {
			for (const input of population.inputs) {
				if (seen.has(traceKey(input.latencyInputId, round))) continue;
				const trace = await runObservation(input, round, sequence + 1, selector);
				attempt.journal.append(trace);
				traces.push(trace);
				seen.add(traceKey(input.latencyInputId, round));
				sequence += 1;
			}
		}
	} finally {
		attempt.journal.close();
	}
	const recovered = readDurableSemanticGateTraces(attemptPaths.journalPath);
	if (recovered.incompleteTrailingLine) throw new Error("Latency journal has an incomplete trailing line.");
	const durableTraces = recovered.traces as LatencyTraceV231[];
	if (durableTraces.length !== LATENCY_V231_EXPECTED_CALLS)
		throw new Error(`Expected ${LATENCY_V231_EXPECTED_CALLS} durable latency traces; got ${durableTraces.length}.`);
	const metrics = deriveLatencyMetricsV231(durableTraces);
	const report = {
		kind: "V2_3_1_LATENCY_CHARACTERIZATION_RUN",
		provider: LATENCY_V231_PROVIDER,
		model: LATENCY_V231_MODEL,
		promptVersion: PROMPT_VERSION,
		promptHash: PROMPT_HASH,
		latencyPopulationSha256: population.populationHash,
		evaluationSourceCommit: sourceCommit,
		executedAt: new Date().toISOString(),
		observationTimeoutMs: LATENCY_V231_TIMEOUT_MS,
		journalPath: LATENCY_V231_TRACES,
		journalRecordCount: durableTraces.length,
		journalSequenceRange: { first: 1, last: durableTraces.length },
		metrics,
		traces: durableTraces,
	};
	writeFinalSemanticGateReportOnce(attemptPaths.finalReportPath, report);
	console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1]?.endsWith("run-latency-v2-3-1-characterization.ts")) await main();
