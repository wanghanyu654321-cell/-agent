import { GOVERNANCE_MANIFEST_VERSION, GOVERNANCE_RUBRICS, type GovernanceRubric } from "../governance/manifest.ts";
import {
	DOMAIN_REPORT_CONFIGS,
	type DomainReportConfig,
	extractMetric,
	type HardInvariantViolation,
	type MatrixRow,
	type ParsedThreshold,
	parseRegressionReport,
	parseThreshold,
	REGRESSION_MATRIX_LAYER_VERSION,
	type RegressionMatrix,
	type RowSource,
	type RowStatus,
	type StatusCounts,
} from "./normalize.ts";

/**
 * Comparison layer of the unified regression matrix (Workstream B).
 *
 * Every row is judged INDEPENDENTLY from every other row; there is no
 * aggregation that could trade an improvement against a regression. In
 * particular, a violated exact-value invariant (op "===") forces its row to
 * REGRESSED and is additionally listed in `hardInvariantViolations` at the top
 * of the matrix — no improvement anywhere else in the matrix can offset it,
 * because no such offsetting code path exists.
 */

export interface RegressionMatrixInput {
	/** Repo-relative report path → raw file text of the tracked (immutable) baseline reports. */
	readonly baselineReports: Readonly<Record<string, string>>;
	/**
	 * Repo-relative report path → raw file text of the caller-supplied current
	 * reports, or null when no current reports were supplied at all.
	 */
	readonly currentReports: Readonly<Record<string, string>> | null;
}

const NO_ARTIFACT_NOTE =
	"no tracked report artifact for this domain; the gate executes directly (vitest/exit_code) and produces no comparable file report";

/**
 * Conservative status semantics:
 * - Either value unavailable (null) → BLOCKED (never a synthesized success).
 * - No numeric acceptance threshold → equal values UNCHANGED; differing values
 *   BLOCKED because the direction is undeterminable without inventing a
 *   threshold (fail-closed, no business semantics are re-evaluated here).
 * - Exact-value invariant (op "===") → a violating current value is REGRESSED
 *   (and recorded as a hard-invariant violation) regardless of baseline
 *   availability, because the violation is absolute; a satisfied current value
 *   with an unavailable baseline is BLOCKED (UNCHANGED vs IMPROVED is
 *   undeterminable), IMPROVED when the baseline violated it, otherwise
 *   UNCHANGED.
 * - Engineering thresholds (>= / > / <= / <) → purely directional against the
 *   baseline: worse is REGRESSED even if the gate would still pass, better is
 *   IMPROVED, equal is UNCHANGED.
 */
export function determineRowStatus(
	threshold: ParsedThreshold | null,
	baseline: number | null,
	current: number | null,
): RowStatus {
	if (threshold !== null && threshold.op === "===" && current !== null) {
		if (current !== threshold.value) return "REGRESSED";
		if (baseline === null) return "BLOCKED";
		return baseline === threshold.value ? "UNCHANGED" : "IMPROVED";
	}
	if (baseline === null || current === null) return "BLOCKED";
	if (threshold === null) return baseline === current ? "UNCHANGED" : "BLOCKED";
	if (threshold.op === ">=" || threshold.op === ">") {
		if (current > baseline) return "IMPROVED";
		if (current < baseline) return "REGRESSED";
		return "UNCHANGED";
	}
	if (current < baseline) return "IMPROVED";
	if (current > baseline) return "REGRESSED";
	return "UNCHANGED";
}

function buildRow(
	rubric: GovernanceRubric,
	config: DomainReportConfig | undefined,
	input: RegressionMatrixInput,
	parsedBaseline: Map<string, Record<string, unknown>>,
	parsedCurrent: Map<string, Record<string, unknown>>,
	violations: HardInvariantViolation[],
): MatrixRow {
	if (config === undefined) {
		return {
			domain: rubric.domain,
			rubricId: rubric.rubricId,
			metric: rubric.metric,
			baseline: null,
			current: null,
			status: "BLOCKED",
			gateClass: rubric.rubricType,
			source: { baselineReport: null, currentReport: null, note: NO_ARTIFACT_NOTE },
		};
	}

	const baselineRaw: string | undefined = input.baselineReports[config.baselineReport];
	const baselineMissing = baselineRaw === undefined;
	let baseline: number | null = null;
	if (baselineRaw !== undefined) {
		let report = parsedBaseline.get(config.baselineReport);
		if (report === undefined) {
			report = parseRegressionReport(config.baselineReport, baselineRaw);
			parsedBaseline.set(config.baselineReport, report);
		}
		baseline = extractMetric(config, config.baselineReport, report, rubric.metric);
	}

	const currentCandidates = config.currentCandidates;
	let current: number | null = null;
	let currentReportPath: string | null = null;
	if (input.currentReports === null) {
		// current not supplied at all
	} else {
		for (const candidate of currentCandidates) {
			const rawText = input.currentReports[candidate];
			if (rawText === undefined) continue;
			currentReportPath = candidate;
			let report = parsedCurrent.get(candidate);
			if (report === undefined) {
				report = parseRegressionReport(candidate, rawText);
				parsedCurrent.set(candidate, report);
			}
			current = extractMetric(config, candidate, report, rubric.metric);
			break;
		}
	}

	const threshold = parseThreshold(rubric.threshold);
	const status = determineRowStatus(threshold, baseline, current);

	const reasons: string[] = [];
	if (baseline === null) {
		reasons.push(
			baselineMissing
				? "tracked baseline report not found"
				: "baseline metric unavailable (missing or non-numeric key)",
		);
	}
	if (current === null) {
		reasons.push(
			currentReportPath === null
				? "current report not supplied"
				: "current metric unavailable (missing or non-numeric key)",
		);
	}
	if (reasons.length === 0 && threshold === null && baseline !== current) {
		reasons.push("no acceptance threshold recorded; values differ, direction undeterminable");
	}

	if (threshold !== null && threshold.op === "===" && current !== null && current !== threshold.value) {
		violations.push({
			domain: rubric.domain,
			rubricId: rubric.rubricId,
			metric: rubric.metric,
			threshold: rubric.threshold,
			baseline,
			current,
			rowStatus: "REGRESSED",
		});
	}

	const source: RowSource = {
		baselineReport: baselineMissing ? null : config.baselineReport,
		currentReport: currentReportPath,
		note: reasons.length === 0 ? null : reasons.join("; "),
	};

	return {
		domain: rubric.domain,
		rubricId: rubric.rubricId,
		metric: rubric.metric,
		baseline,
		current,
		status,
		gateClass: rubric.rubricType,
		source,
	};
}

function compareRows(a: MatrixRow, b: MatrixRow): number {
	if (a.domain !== b.domain) return a.domain < b.domain ? -1 : 1;
	if (a.rubricId !== b.rubricId) return a.rubricId < b.rubricId ? -1 : 1;
	return 0;
}

function compareViolations(a: HardInvariantViolation, b: HardInvariantViolation): number {
	if (a.domain !== b.domain) return a.domain < b.domain ? -1 : 1;
	if (a.rubricId !== b.rubricId) return a.rubricId < b.rubricId ? -1 : 1;
	return 0;
}

/** Fail-closed self-check: every listed violation must be a REGRESSED row (no offsetting path exists). */
function assertViolationsConsistent(rows: readonly MatrixRow[], violations: readonly HardInvariantViolation[]): void {
	const statusByRubricId = new Map(rows.map((row) => [row.rubricId, row.status]));
	for (const violation of violations) {
		const rowStatus = statusByRubricId.get(violation.rubricId);
		if (rowStatus !== "REGRESSED") {
			throw new Error(
				`internal consistency failure: hard-invariant violation ${violation.rubricId} is not a REGRESSED row (status: ${rowStatus})`,
			);
		}
	}
}

/**
 * Builds the unified regression matrix. Deterministic: the same input always
 * produces a deep-equal matrix (rows and violations ordered by domain then
 * rubricId; no timestamps or machine-dependent values are recorded).
 */
export function buildRegressionMatrix(input: RegressionMatrixInput): RegressionMatrix {
	const configsByDomain = new Map(DOMAIN_REPORT_CONFIGS.map((config) => [config.domain, config]));
	const parsedBaseline = new Map<string, Record<string, unknown>>();
	const parsedCurrent = new Map<string, Record<string, unknown>>();

	const rows: MatrixRow[] = [];
	const violations: HardInvariantViolation[] = [];

	for (const rubric of GOVERNANCE_RUBRICS) {
		rows.push(buildRow(rubric, configsByDomain.get(rubric.domain), input, parsedBaseline, parsedCurrent, violations));
	}

	rows.sort(compareRows);
	violations.sort(compareViolations);
	assertViolationsConsistent(rows, violations);

	let improved = 0;
	let unchanged = 0;
	let regressed = 0;
	let blocked = 0;
	for (const row of rows) {
		if (row.status === "IMPROVED") improved += 1;
		else if (row.status === "UNCHANGED") unchanged += 1;
		else if (row.status === "REGRESSED") regressed += 1;
		else blocked += 1;
	}
	const statusCounts: StatusCounts = { improved, unchanged, regressed, blocked };

	return {
		manifestVersion: GOVERNANCE_MANIFEST_VERSION,
		matrixLayer: REGRESSION_MATRIX_LAYER_VERSION,
		hardInvariantViolations: violations,
		rows,
		statusCounts,
	};
}
