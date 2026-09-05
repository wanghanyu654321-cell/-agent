import { jobReadyRetrievalCases } from "./cases.ts";
import { jobReadyCorpus } from "./corpus.ts";
import { canonicalJson, type FrozenPopulation, freezePopulation } from "./freeze.ts";
import { type CaseEvaluation, type MetricsSummary, scoreRun } from "./metrics.ts";
import type { RetrievalMeasurement } from "./schema.ts";

/**
 * Private-data-free reporting for the Job-Ready RAG eval (contract section 10 /
 * section 12.D). Reports bind every measurement to the frozen population hashes,
 * surface the hard safety invariants, and report ranked/quality metrics WITHOUT
 * an acceptance threshold or an overall Job-Ready PASS label, because CONTRACT
 * GAP-05 is unresolved. Reports never embed corpus prose, credentials, raw
 * customer transcripts, or hidden reasoning.
 */

export interface BindingResult {
	ok: boolean;
	mismatchedCaseIds: string[];
	observedCasesSha256: string[];
	observedCorpusSha256: string[];
}

export function verifyMeasurementBinding(
	measurements: readonly RetrievalMeasurement[],
	frozen: FrozenPopulation,
): BindingResult {
	const mismatchedCaseIds = measurements
		.filter((item) => item.casesSha256 !== frozen.casesSha256 || item.corpusSha256 !== frozen.corpusSha256)
		.map((item) => item.caseId);
	return {
		ok: mismatchedCaseIds.length === 0,
		mismatchedCaseIds,
		observedCasesSha256: [...new Set(measurements.map((item) => item.casesSha256))].sort(),
		observedCorpusSha256: [...new Set(measurements.map((item) => item.corpusSha256))].sort(),
	};
}

export interface RetrievalEvalReport {
	schema: "job-ready-rag/retrieval-eval-report@1";
	mode: MetricsSummary["mode"];
	frozenPopulation: FrozenPopulation;
	binding: BindingResult;
	metrics: MetricsSummary;
	evaluations: CaseEvaluation[];
	safetyInvariantsHold: boolean;
	gap05: { status: "unresolved"; note: string };
	/** Always null: GAP-05 forbids an overall Job-Ready PASS label here. */
	overallPassLabel: null;
}

export function buildReport(
	measurements: readonly RetrievalMeasurement[],
	frozen: FrozenPopulation = freezePopulation(),
): RetrievalEvalReport {
	const { evaluations, metrics } = scoreRun(jobReadyRetrievalCases, measurements, jobReadyCorpus);
	return {
		schema: "job-ready-rag/retrieval-eval-report@1",
		mode: metrics.mode,
		frozenPopulation: frozen,
		binding: verifyMeasurementBinding(measurements, frozen),
		metrics,
		evaluations,
		safetyInvariantsHold: metrics.safetyInvariants.allHold,
		gap05: { status: "unresolved", note: metrics.gap05.note },
		overallPassLabel: null,
	};
}

function pct(value: number | null): string {
	return value === null ? "N/A" : `${(value * 100).toFixed(2)}%`;
}

function ms(value: number | null): string {
	return value === null ? "N/A" : `${value.toFixed(0)}ms`;
}

export function renderReportJson(report: RetrievalEvalReport): string {
	return canonicalJson(report);
}

export function renderReportMarkdown(report: RetrievalEvalReport): string {
	const { frozenPopulation: pop, binding, metrics: m, metrics } = report;
	const inv = metrics.safetyInvariants;
	const lines: string[] = [];
	lines.push("# Job-Ready RAG Retrieval Evaluation Report");
	lines.push("");
	lines.push(`- Report schema: \`${report.schema}\``);
	lines.push(`- Retrieval mode: \`${report.mode}\``);
	lines.push(`- Measurements: ${metrics.measurementCount} of ${metrics.caseCount} population cases`);
	lines.push("");
	lines.push("## CONTRACT GAP-05 (unresolved) — no overall PASS");
	lines.push("");
	lines.push(`> ${report.gap05.note}`);
	lines.push("");
	lines.push(
		`Overall Job-Ready PASS label: **${report.overallPassLabel === null ? "not asserted" : report.overallPassLabel}**`,
	);
	lines.push("");
	lines.push("## Frozen population");
	lines.push("");
	lines.push(
		`- Cases: ${pop.caseCount} (${pop.answerableCount} answerable / ${pop.noAnswerCount} no-answer / ${pop.ambiguousCount} ambiguous)`,
	);
	lines.push(
		`- Provenance: ${pop.humanAuthoredCaseCount} human-authored official source / ${pop.syntheticFixtureCaseCount} synthetic isolation fixture`,
	);
	lines.push(
		`- Corpus entries: ${pop.corpusEntryCount} (${pop.approvedEntryCount} approved / ${pop.syntheticFixtureCount} synthetic fixtures)`,
	);
	lines.push(`- Negative controls: ${pop.negativeControlCount} across [${pop.negativeControlDimensions.join(", ")}]`);
	lines.push(`- \`casesSha256\`: \`${pop.casesSha256}\``);
	lines.push(`- \`corpusSha256\`: \`${pop.corpusSha256}\``);
	lines.push("");
	lines.push("## Measurement binding");
	lines.push("");
	lines.push(`- All measurements bound to frozen population: **${binding.ok ? "yes" : "NO"}**`);
	if (!binding.ok) {
		lines.push(`- Mismatched case IDs: ${binding.mismatchedCaseIds.join(", ") || "(none)"}`);
	}
	lines.push("");
	lines.push("## Hard safety invariants (mandatory, not tunable thresholds)");
	lines.push("");
	lines.push(`- Status: **${report.safetyInvariantsHold ? "HOLD" : "VIOLATED"}**`);
	lines.push(`- Cross-scope admissions: ${inv.crossScopeAdmissions}`);
	lines.push(`- Unapproved admissions: ${inv.unapprovedAdmissions}`);
	lines.push(`- Stale-version admissions: ${inv.staleVersionAdmissions}`);
	lines.push(`- Unknown admissions: ${inv.unknownAdmissions}`);
	lines.push(`- Ordinary authorization on 0/2+: ${inv.ordinaryAuthorizationOnZeroOrMultiple}`);
	if (inv.violatingCaseIds.length > 0) {
		lines.push(`- Violating case IDs: ${inv.violatingCaseIds.join(", ")}`);
	}
	lines.push("");
	lines.push("## Ranked / quality metrics (reported, NOT thresholded — GAP-05)");
	lines.push("");
	lines.push(
		`- Recall@3 answerable stratum: ${pct(m.recallAnswerable.macroRecallAt3)} over ${m.recallAnswerable.cases} cases`,
	);
	lines.push(
		`- Recall@3 ambiguous stratum: ${pct(m.recallAmbiguous.macroRecallAt3)} over ${m.recallAmbiguous.cases} cases`,
	);
	lines.push(
		`- Wrong Evidence Rate: ${pct(m.wrongEvidenceRate)} (${m.wrongEvidenceWrongDistinct} wrong / ${m.wrongEvidenceReturnedDistinct} returned distinct)`,
	);
	lines.push(`- Coverage (cases with >=1 returned distinct): ${pct(m.coverage)}`);
	lines.push(`- No-answer Accuracy: ${pct(m.noAnswerAccuracy)} (${m.noAnswerCorrect} / ${m.noAnswerTotal})`);
	lines.push(`- Routing accuracy (0/1/2+): ${pct(m.routingAccuracy)}`);
	lines.push(
		`  - bucket 0: ${m.routingBuckets["0"].correct}/${m.routingBuckets["0"].expected}; ` +
			`bucket 1: ${m.routingBuckets["1"].correct}/${m.routingBuckets["1"].expected}; ` +
			`bucket 2+: ${m.routingBuckets["2+"].correct}/${m.routingBuckets["2+"].expected}`,
	);
	lines.push(
		`- Retrieval latency: min ${ms(m.latency.min)} / P50 ${ms(m.latency.p50)} / P95 ${ms(m.latency.p95)} / max ${ms(m.latency.max)} over ${m.latency.count}`,
	);
	lines.push(
		`- Latency timeouts: ${m.latency.timeoutCount}; latency errors: ${m.latency.errorCount} (never success-only)`,
	);
	lines.push(`- Dependency failures: ${m.dependencyFailureCount}`);
	lines.push("");
	lines.push("## Failed cases");
	lines.push("");
	lines.push(`- Passed: ${m.passedCaseCount} / ${m.caseCount}`);
	lines.push(`- Failed case IDs: ${m.failedCaseIds.length === 0 ? "(none)" : m.failedCaseIds.join(", ")}`);
	lines.push("");
	lines.push(
		"_Lexical FIRST results are preserved separately from later vector results; this report covers one mode._",
	);
	lines.push("");
	return lines.join("\n");
}
