import type { RubricType } from "../governance/manifest.ts";

/**
 * Thin normalization layer for the unified regression matrix (Evaluation
 * Governance Consolidation V1, Workstream B).
 *
 * This layer only parses and normalizes EXISTING evaluator report artifacts.
 * The Workstream A governance manifest (evals/governance/manifest.ts) stays the
 * single source of rubric ids, threshold literals and gate classes; nothing
 * here recomputes a business metric, replaces an evaluator, or blends hard
 * invariants with quality metrics. Reports are parsed fail-closed:
 *
 * - Corrupted outer structure (invalid JSON, non-object top level, a metrics
 *   container path that exists but is not an object) aborts the matrix with a
 *   structured `RegressionReportError` instead of being silently coerced.
 * - Per-metric schema drift (a key that is missing or non-numeric inside an
 *   otherwise valid report) is recorded as an unavailable value (null), which
 *   can only surface downstream as a BLOCKED matrix row — never as success.
 */

// --- matrix row contract -----------------------------------------------------

export const ROW_STATUSES = ["IMPROVED", "UNCHANGED", "REGRESSED", "BLOCKED"] as const;

export type RowStatus = (typeof ROW_STATUSES)[number];

export interface RowSource {
	/** Repo-relative path of the tracked (immutable) baseline report, or null when none exists. */
	readonly baselineReport: string | null;
	/** Repo-relative path of the supplied current report, or null when none was supplied/matched. */
	readonly currentReport: string | null;
	/** Why the row is BLOCKED, or null when the row is fully measured. */
	readonly note: string | null;
}

export interface MatrixRow {
	readonly domain: string;
	readonly rubricId: string;
	readonly metric: string;
	readonly baseline: number | null;
	readonly current: number | null;
	readonly status: RowStatus;
	readonly gateClass: RubricType;
	readonly source: RowSource;
}

/** A violated HARD_INVARIANT rubric with an exact-value (===) threshold; listed at the top of the matrix and never offsettable. */
export interface HardInvariantViolation {
	readonly domain: string;
	readonly rubricId: string;
	readonly metric: string;
	/** The manifest threshold literal, verbatim (e.g. "=== 0"). */
	readonly threshold: string;
	readonly baseline: number | null;
	readonly current: number;
	readonly rowStatus: "REGRESSED";
}

/** Pure per-status counts. Deliberately NOT a blended or averaged score of any kind. */
export interface StatusCounts {
	readonly improved: number;
	readonly unchanged: number;
	readonly regressed: number;
	readonly blocked: number;
}

export interface RegressionMatrix {
	readonly manifestVersion: string;
	readonly matrixLayer: string;
	readonly hardInvariantViolations: readonly HardInvariantViolation[];
	readonly rows: readonly MatrixRow[];
	readonly statusCounts: StatusCounts;
}

export const REGRESSION_MATRIX_LAYER_VERSION = "pre-icp-evaluation-governance-v1-regression-matrix-v1";

// --- threshold parsing -------------------------------------------------------

export type ThresholdOp = "===" | ">=" | "<=" | ">" | "<";

export interface ParsedThreshold {
	readonly op: ThresholdOp;
	readonly value: number;
}

const THRESHOLD_PATTERN = /^(===|>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)$/;

/**
 * Parses a manifest threshold literal into a numeric comparison. Literals that
 * record no numeric acceptance basis ("none — reported only ...", descriptive
 * or composite thresholds) return null: no threshold is invented for them.
 */
export function parseThreshold(threshold: string): ParsedThreshold | null {
	const match = THRESHOLD_PATTERN.exec(threshold);
	if (match === null) return null;
	return { op: match[1] as ThresholdOp, value: Number(match[2]) };
}

// --- domain report configuration ---------------------------------------------

/**
 * How one domain's metrics are located in its report artifacts. The baseline
 * report is the tracked immutable history (manifest reportSource[0]); current
 * candidates are searched in order for the caller-supplied current report.
 */
export interface DomainReportConfig {
	readonly domain: string;
	readonly baselineReport: string;
	readonly currentCandidates: readonly string[];
	/** Ordered container paths to try; [] means metrics sit flat at the report top level. */
	readonly metricContainerPaths: readonly (readonly string[])[];
}

export const DOMAIN_REPORT_CONFIGS: readonly DomainReportConfig[] = [
	{
		domain: "retrieval",
		baselineReport: "evals/retrieval/reports/public-latest.json",
		currentCandidates: ["evals/retrieval/reports/public-latest.json"],
		metricContainerPaths: [["metrics"]],
	},
	{
		domain: "realWorld",
		baselineReport: "evals/retrieval/reports/public-real-world-v2.1.1-final.json",
		currentCandidates: [
			"evals/retrieval/reports/public-real-world-v2.1.1-final.json",
			"evals/retrieval/reports/first-run.json",
		],
		metricContainerPaths: [
			["runtime", "metrics"],
			["retrieval", "final", "metrics"],
		],
	},
	{
		domain: "safetyV1",
		baselineReport: "evals/safety/reports/latest.json",
		currentCandidates: ["evals/safety/reports/latest.json"],
		metricContainerPaths: [[]],
	},
	{
		domain: "safetyRobustness",
		baselineReport: "evals/safety/robustness/reports/latest.json",
		currentCandidates: ["evals/safety/robustness/reports/latest.json"],
		metricContainerPaths: [[]],
	},
	{
		domain: "safetyHoldout",
		baselineReport: "evals/safety/holdout/reports/first-run.json",
		currentCandidates: ["evals/safety/holdout/reports/first-run.json", "evals/safety/holdout/reports/latest.json"],
		metricContainerPaths: [[]],
	},
	{
		domain: "knowledge",
		baselineReport: "evals/knowledge/reports/latest.json",
		currentCandidates: ["evals/knowledge/reports/latest.json"],
		metricContainerPaths: [[]],
	},
	{
		domain: "semanticSelection",
		baselineReport: "evals/selection/semantic/reports/io-contract-run.json",
		currentCandidates: ["evals/selection/semantic/reports/io-contract-run.json"],
		metricContainerPaths: [["metrics"]],
	},
];

// --- fail-closed report parsing ----------------------------------------------

export class RegressionReportError extends Error {
	readonly reportPath: string;

	constructor(reportPath: string, reason: string) {
		super(`malformed regression report at ${reportPath}: ${reason}`);
		this.name = "RegressionReportError";
		this.reportPath = reportPath;
	}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses a report file's raw text; outer-structure corruption fails closed. */
export function parseRegressionReport(reportPath: string, rawText: string): Record<string, unknown> {
	// RFC 8259 permits implementations to ignore a leading UTF-8 BOM (common when
	// Windows tooling writes report files); anything else stays fail-closed.
	const text = rawText.charCodeAt(0) === 0xfeff ? rawText.slice(1) : rawText;
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		throw new RegressionReportError(reportPath, `invalid JSON (${(error as Error).message})`);
	}
	if (!isPlainObject(parsed)) {
		throw new RegressionReportError(reportPath, "top-level value is not a JSON object");
	}
	return parsed;
}

/**
 * Resolves one metrics-container path. A missing path segment is schema drift
 * (the container is unavailable); a segment that exists but is not an object
 * is structural corruption and fails closed.
 */
function resolveContainer(
	reportPath: string,
	report: Record<string, unknown>,
	pathSegments: readonly string[],
): Record<string, unknown> | null {
	let container: Record<string, unknown> = report;
	for (const segment of pathSegments) {
		const next: unknown = container[segment];
		if (next === undefined) return null;
		if (!isPlainObject(next)) {
			throw new RegressionReportError(reportPath, `"${segment}" exists but is not an object`);
		}
		container = next;
	}
	return container;
}

/**
 * Reads one rubric metric out of a parsed report. Container paths are tried in
 * order; the first path where the metric key exists as a finite number wins.
 * Missing or non-numeric keys yield null (schema drift, never synthesized).
 * Composite metric descriptors (comma lists, prose) simply match no key.
 */
export function extractMetric(
	config: DomainReportConfig,
	reportPath: string,
	report: Record<string, unknown>,
	metric: string,
): number | null {
	for (const pathSegments of config.metricContainerPaths) {
		const container = resolveContainer(reportPath, report, pathSegments);
		if (container === null) continue;
		const value: unknown = container[metric];
		if (typeof value === "number" && Number.isFinite(value)) return value;
	}
	return null;
}
