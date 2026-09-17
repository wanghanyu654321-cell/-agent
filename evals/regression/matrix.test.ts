import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GOVERNANCE_RUBRICS } from "../governance/manifest.ts";
import { buildRegressionMatrix, determineRowStatus } from "./compare.ts";
import { canonicalJson, renderMarkdown } from "./matrix.ts";
import {
	DOMAIN_REPORT_CONFIGS,
	type MatrixRow,
	parseThreshold,
	type RegressionMatrix,
	RegressionReportError,
} from "./normalize.ts";

/**
 * Focused tests for the thin unified regression matrix (Workstream B).
 * Fixtures are synthetic (no real corpus data). They cover the eight required
 * cases: unchanged, improvement, regression, hard-invariant violation (explicit
 * and never offset), missing report (BLOCKED), malformed report (fail-closed),
 * no blended score, and deterministic ordering — plus a read-only smoke pass
 * over the real tracked baseline reports and anchoring of the domain report
 * configuration back to the governance manifest.
 */

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

function readRepoFile(relativePath: string): string {
	return readFileSync(join(repoRoot, relativePath), "utf8");
}

// --- synthetic fixtures -------------------------------------------------------

const ROBUSTNESS_PATH = "evals/safety/robustness/reports/latest.json";
const RETRIEVAL_PATH = "evals/retrieval/reports/public-latest.json";
const REAL_WORLD_PATH = "evals/retrieval/reports/public-real-world-v2.1.1-final.json";
const SAFETY_V1_PATH = "evals/safety/reports/latest.json";
const SEMANTIC_PATH = "evals/selection/semantic/reports/io-contract-run.json";

const baselineRetrievalMetrics = {
	top1HitRate: 1,
	recallAt3: 1,
	noAnswerCorrectRejectionRate: 1,
	wrongEvidenceRate: 0,
	crossTenantLeakageRate: 0,
	crossStoreLeakageRate: 0,
	unauthorizedKnowledgeExposureRate: 0,
};

const currentRetrievalMetrics = {
	...baselineRetrievalMetrics,
	top1HitRate: 0.9,
	crossTenantLeakageRate: 0.02,
};

const baselineRobustnessMetrics = {
	totalCases: 100,
	passRate: 1,
	requiredEscalationRecall: 1,
	safetyDetectionRecall: 0.98,
	hardNegativeAccuracy: 0.99,
	unsupportedProfessionalClaimRate: 0,
	syntheticProductionEvidenceAcceptance: 0,
	unapprovedEvidenceAcceptance: 0,
	duplicateHandoffCount: 0,
};

const currentRobustnessMetrics = {
	...baselineRobustnessMetrics,
	safetyDetectionRecall: 0.99,
};

const baselineSafetyV1Metrics = {
	totalCases: 30,
	passRate: 1,
	safetyDetectionRecall: 1,
	escalationPrecision: 1,
	escalationRecall: 1,
	groundedAnswerRate: 1,
	unsupportedProfessionalClaimRate: 0,
	toolSuccessRate: 1,
	requiredEscalationRecall: 1,
};

const currentSafetyV1Metrics = {
	...baselineSafetyV1Metrics,
	passRate: 0.9,
};

const BASELINE_REPORTS: Record<string, string> = {
	[ROBUSTNESS_PATH]: JSON.stringify(baselineRobustnessMetrics),
	[RETRIEVAL_PATH]: JSON.stringify({ gatePassed: true, metrics: baselineRetrievalMetrics }),
	[REAL_WORLD_PATH]: JSON.stringify({
		retrieval: { final: { metrics: { top1HitRate: 0.96 } } },
		runtime: {
			metrics: {
				unsupportedBusinessFactRate: 0,
				evidenceVersionTraceAccuracy: 1,
				noEvidenceFailClosedRate: 1,
			},
		},
	}),
	[SAFETY_V1_PATH]: JSON.stringify(baselineSafetyV1Metrics),
	[SEMANTIC_PATH]: JSON.stringify({
		metrics: {
			correctSelectionRate: 0.9,
			wrongSelectionRate: 0,
			answerableCoverage: 0.95,
			selectedEvidencePrecision: 1,
			multiCandidateWrongSelectionRate: 0,
			invalidSelectorOutputRate: 0,
			orderInducedWrongSelectionRate: 0,
		},
	}),
};

const CURRENT_REPORTS: Record<string, string> = {
	[ROBUSTNESS_PATH]: JSON.stringify(currentRobustnessMetrics),
	[RETRIEVAL_PATH]: JSON.stringify({ gatePassed: false, metrics: currentRetrievalMetrics }),
	[SAFETY_V1_PATH]: JSON.stringify(currentSafetyV1Metrics),
};

function buildWithCurrent(): RegressionMatrix {
	return buildRegressionMatrix({ baselineReports: BASELINE_REPORTS, currentReports: CURRENT_REPORTS });
}

function row(matrix: RegressionMatrix, rubricId: string): MatrixRow | undefined {
	return matrix.rows.find((candidate) => candidate.rubricId === rubricId);
}

// --- threshold parsing --------------------------------------------------------

describe("threshold parsing", () => {
	it("parses numeric acceptance literals", () => {
		expect(parseThreshold("=== 0")).toEqual({ op: "===", value: 0 });
		expect(parseThreshold("=== 1")).toEqual({ op: "===", value: 1 });
		expect(parseThreshold(">= 0.85")).toEqual({ op: ">=", value: 0.85 });
		expect(parseThreshold("<= 0.05")).toEqual({ op: "<=", value: 0.05 });
		expect(parseThreshold(">= 100")).toEqual({ op: ">=", value: 100 });
	});

	it("returns null for report-only and descriptive thresholds (nothing is invented)", () => {
		expect(parseThreshold("none — reported only")).toBe(null);
		expect(parseThreshold("none — reported only in the V1 runner")).toBe(null);
		expect(parseThreshold("none — reported only, no acceptance threshold")).toBe(null);
		expect(parseThreshold("duplicate authoritative business write === 0")).toBe(null);
		expect(parseThreshold("allHold === true (crossScope / unapproved / staleVersion counts all === 0)")).toBe(null);
	});
});

// --- row status semantics -----------------------------------------------------

describe("row status semantics", () => {
	it("BLOCKS rows whose baseline or current value is unavailable", () => {
		expect(determineRowStatus(null, null, 1)).toBe("BLOCKED");
		expect(determineRowStatus({ op: "===", value: 0 }, 0, null)).toBe("BLOCKED");
		expect(determineRowStatus({ op: ">=", value: 0.85 }, null, 0.9)).toBe("BLOCKED");
	});

	it("treats an exact invariant as violated the moment the current value deviates", () => {
		expect(determineRowStatus({ op: "===", value: 0 }, 0, 0.02)).toBe("REGRESSED");
		expect(determineRowStatus({ op: "===", value: 1 }, 1, 0.98)).toBe("REGRESSED");
		expect(determineRowStatus({ op: "===", value: 0 }, null, 0.02)).toBe("REGRESSED");
	});

	it("marks a satisfied exact invariant IMPROVED only when the baseline violated it", () => {
		expect(determineRowStatus({ op: "===", value: 0 }, 0.03, 0)).toBe("IMPROVED");
		expect(determineRowStatus({ op: "===", value: 0 }, 0, 0)).toBe("UNCHANGED");
		expect(determineRowStatus({ op: "===", value: 0 }, null, 0)).toBe("BLOCKED");
	});

	it("treats engineering thresholds directionally regardless of gate satisfaction", () => {
		expect(determineRowStatus({ op: ">=", value: 0.85 }, 1, 0.9)).toBe("REGRESSED");
		expect(determineRowStatus({ op: ">=", value: 0.85 }, 0.85, 0.86)).toBe("IMPROVED");
		expect(determineRowStatus({ op: ">=", value: 0.95 }, 0.9, 0.92)).toBe("IMPROVED");
		expect(determineRowStatus({ op: "<=", value: 0.05 }, 0, 0.04)).toBe("REGRESSED");
		expect(determineRowStatus({ op: "<=", value: 0.05 }, 0.04, 0.02)).toBe("IMPROVED");
		expect(determineRowStatus({ op: ">=", value: 0.85 }, 0.9, 0.9)).toBe("UNCHANGED");
	});

	it("BLOCKS thresholdless rows whose values differ (direction undeterminable, none invented)", () => {
		expect(determineRowStatus(null, 1, 1)).toBe("UNCHANGED");
		expect(determineRowStatus(null, 1, 0.9)).toBe("BLOCKED");
	});
});

// --- matrix fixture scenarios --------------------------------------------------

describe("regression matrix fixture scenarios", () => {
	it("marks equal baseline/current rows UNCHANGED", () => {
		const matrix = buildWithCurrent();
		expect(row(matrix, "retrieval.recallAt3")?.status).toBe("UNCHANGED");
		expect(row(matrix, "safetyRobustness.passRate")?.status).toBe("UNCHANGED");
		expect(row(matrix, "safetyRobustness.duplicateHandoffCount")?.status).toBe("UNCHANGED");
		expect(row(matrix, "safetyV1.totalCases")?.status).toBe("UNCHANGED");
		expect(matrix.statusCounts.unchanged).toBe(21);
	});

	it("marks directionally better rows IMPROVED", () => {
		const matrix = buildWithCurrent();
		const improved = row(matrix, "safetyRobustness.safetyDetectionRecall");
		expect(improved?.baseline).toBe(0.98);
		expect(improved?.current).toBe(0.99);
		expect(improved?.status).toBe("IMPROVED");
		expect(matrix.statusCounts.improved).toBe(1);
	});

	it("marks directionally worse rows REGRESSED even when the gate would still pass", () => {
		const matrix = buildWithCurrent();
		const top1 = row(matrix, "retrieval.top1HitRate");
		expect(top1?.baseline).toBe(1);
		expect(top1?.current).toBe(0.9);
		expect(top1?.status).toBe("REGRESSED");
	});

	it("lists hard-invariant violations explicitly and never offsets them with improvements", () => {
		const matrix = buildWithCurrent();
		expect(matrix.hardInvariantViolations.map((violation) => violation.rubricId)).toEqual([
			"retrieval.crossTenantLeakageRate",
		]);
		const violation = matrix.hardInvariantViolations[0];
		expect(violation.threshold).toBe("=== 0");
		expect(violation.baseline).toBe(0);
		expect(violation.current).toBe(0.02);
		expect(violation.rowStatus).toBe("REGRESSED");
		const violationRow = row(matrix, "retrieval.crossTenantLeakageRate");
		expect(violationRow?.status).toBe("REGRESSED");
		// simultaneous improvements exist in the same matrix and offset nothing:
		expect(matrix.statusCounts.improved).toBe(1);
		expect(matrix.statusCounts.regressed).toBe(2);
		for (const entry of matrix.hardInvariantViolations) {
			expect(row(matrix, entry.rubricId)?.status).toBe("REGRESSED");
		}
	});

	it("marks a satisfied exact invariant IMPROVED when the baseline violated it", () => {
		const matrix = buildRegressionMatrix({
			baselineReports: {
				...BASELINE_REPORTS,
				[RETRIEVAL_PATH]: JSON.stringify({
					metrics: { ...baselineRetrievalMetrics, crossTenantLeakageRate: 0.03 },
				}),
			},
			currentReports: {
				...CURRENT_REPORTS,
				[RETRIEVAL_PATH]: JSON.stringify({
					metrics: { ...currentRetrievalMetrics, crossTenantLeakageRate: 0 },
				}),
			},
		});
		const repaired = row(matrix, "retrieval.crossTenantLeakageRate");
		expect(repaired?.baseline).toBe(0.03);
		expect(repaired?.current).toBe(0);
		expect(repaired?.status).toBe("IMPROVED");
		expect(matrix.hardInvariantViolations).toHaveLength(0);
	});

	it("marks rows BLOCKED when reports are missing, drift, or the domain has no report artifact", () => {
		const matrix = buildWithCurrent();
		const knowledge = row(matrix, "knowledge.passRate");
		expect(knowledge?.status).toBe("BLOCKED");
		expect(knowledge?.source.note).toContain("tracked baseline report not found");
		const realWorld = row(matrix, "realWorld.unsupportedBusinessFactRate");
		expect(realWorld?.baseline).toBe(0);
		expect(realWorld?.current).toBe(null);
		expect(realWorld?.status).toBe("BLOCKED");
		expect(realWorld?.source.note).toContain("current report not supplied");
		const jobReady = row(matrix, "jobReadyRag.safetyInvariants");
		expect(jobReady?.status).toBe("BLOCKED");
		expect(jobReady?.source.note).toContain("no tracked report artifact");
		const reportedMetrics = row(matrix, "retrieval.reportedMetrics");
		expect(reportedMetrics?.status).toBe("BLOCKED");
		expect(reportedMetrics?.source.note).toContain("baseline metric unavailable");
		const ambiguous = row(matrix, "realWorld.ambiguousEvidenceFailClosedRate");
		expect(ambiguous?.baseline).toBe(null);
		expect(ambiguous?.status).toBe("BLOCKED");
		expect(row(matrix, "realWorld.routedOutcomeAccuracy")?.status).toBe("BLOCKED");
	});

	it("BLOCKS every row when no current reports are supplied at all", () => {
		const matrix = buildRegressionMatrix({ baselineReports: BASELINE_REPORTS, currentReports: null });
		expect(matrix.rows).toHaveLength(GOVERNANCE_RUBRICS.length);
		expect(matrix.statusCounts).toEqual({
			improved: 0,
			unchanged: 0,
			regressed: 0,
			blocked: GOVERNANCE_RUBRICS.length,
		});
		expect(matrix.hardInvariantViolations).toHaveLength(0);
	});

	it("marks thresholdless rows whose values differ BLOCKED instead of inventing a direction", () => {
		const matrix = buildWithCurrent();
		const passRate = row(matrix, "safetyV1.passRate");
		expect(passRate?.baseline).toBe(1);
		expect(passRate?.current).toBe(0.9);
		expect(passRate?.status).toBe("BLOCKED");
		expect(passRate?.source.note).toContain("no acceptance threshold recorded");
	});

	it("fails closed on malformed current reports", () => {
		expect(() =>
			buildRegressionMatrix({
				baselineReports: BASELINE_REPORTS,
				currentReports: { [ROBUSTNESS_PATH]: "{ not valid json" },
			}),
		).toThrow(RegressionReportError);
	});

	it("fails closed when a report top level is not an object", () => {
		expect(() =>
			buildRegressionMatrix({
				baselineReports: { ...BASELINE_REPORTS, [RETRIEVAL_PATH]: "[1,2,3]" },
				currentReports: null,
			}),
		).toThrow(/top-level value is not a JSON object/);
	});

	it("fails closed when a metrics container path exists but is not an object", () => {
		expect(() =>
			buildRegressionMatrix({
				baselineReports: { ...BASELINE_REPORTS, [REAL_WORLD_PATH]: JSON.stringify({ runtime: 42 }) },
				currentReports: null,
			}),
		).toThrow(RegressionReportError);
	});

	it("emits no blended, overall or averaged score anywhere", () => {
		const matrix = buildWithCurrent();
		const serialized = canonicalJson(matrix);
		expect(serialized).not.toMatch(/(overall|blended|composite|combined|average|score)/i);
		const reparsed = JSON.parse(serialized) as Record<string, unknown>;
		expect(Object.keys(reparsed)).toEqual([
			"hardInvariantViolations",
			"manifestVersion",
			"matrixLayer",
			"rows",
			"statusCounts",
		]);
		expect(Object.keys(reparsed.statusCounts as object)).toEqual(["blocked", "improved", "regressed", "unchanged"]);
		const firstRow = (reparsed.rows as Array<Record<string, unknown>>)[0] as Record<string, unknown>;
		expect(Object.keys(firstRow)).toEqual([
			"baseline",
			"current",
			"domain",
			"gateClass",
			"metric",
			"rubricId",
			"source",
			"status",
		]);
	});

	it("is deterministic: identical input yields a deep-equal matrix and identical canonical JSON", () => {
		const first = buildWithCurrent();
		const second = buildWithCurrent();
		expect(second).toEqual(first);
		expect(canonicalJson(second)).toBe(canonicalJson(first));
		const sortedRubricIds = [...first.rows]
			.sort((a, b) => {
				if (a.domain !== b.domain) return a.domain < b.domain ? -1 : 1;
				return a.rubricId < b.rubricId ? -1 : 1;
			})
			.map((entry) => entry.rubricId);
		expect(first.rows.map((entry) => entry.rubricId)).toEqual(sortedRubricIds);
		const sortedViolations = [...first.hardInvariantViolations]
			.sort((a, b) => {
				if (a.domain !== b.domain) return a.domain < b.domain ? -1 : 1;
				return a.rubricId < b.rubricId ? -1 : 1;
			})
			.map((violation) => violation.rubricId);
		expect(first.hardInvariantViolations.map((violation) => violation.rubricId)).toEqual(sortedViolations);
	});

	it("renders the violations section before the rows section in Markdown", () => {
		const matrix = buildWithCurrent();
		const markdown = renderMarkdown(matrix);
		const violationsAt = markdown.indexOf("## Hard invariant violations");
		const rowsAt = markdown.indexOf("## Matrix rows");
		expect(violationsAt).toBeGreaterThanOrEqual(0);
		expect(rowsAt).toBeGreaterThan(violationsAt);
		expect(markdown).toContain("retrieval.crossTenantLeakageRate");
		expect(markdown).toContain("=== 0");
		expect(markdown).toContain("0.02");
		expect(markdown).toContain("IMPROVED: 1");
		expect(markdown).toContain("REGRESSED: 2");
		expect(markdown).toContain("BLOCKED: 47");
	});
});

// --- real tracked baseline reports (read-only smoke) ---------------------------

describe("real tracked baseline reports", () => {
	it("parses every real tracked baseline report and yields exactly one row per rubric", () => {
		const baselineReports: Record<string, string> = {};
		for (const config of DOMAIN_REPORT_CONFIGS) {
			baselineReports[config.baselineReport] = readRepoFile(config.baselineReport);
		}
		const matrix = buildRegressionMatrix({ baselineReports, currentReports: null });
		expect(matrix.rows).toHaveLength(GOVERNANCE_RUBRICS.length);
		expect(matrix.statusCounts).toEqual({
			improved: 0,
			unchanged: 0,
			regressed: 0,
			blocked: GOVERNANCE_RUBRICS.length,
		});
		expect(matrix.hardInvariantViolations).toHaveLength(0);
		expect(row(matrix, "safetyRobustness.populationSize")?.baseline).toBe(100);
		expect(row(matrix, "realWorld.unsupportedBusinessFactRate")?.baseline).toBe(0);
		expect(row(matrix, "knowledge.populationSize")?.baseline).toBe(46);
		expect(row(matrix, "safetyHoldout.passRate")?.baseline).toBe(0.16666666666666666);
		expect(row(matrix, "retrieval.top1HitRate")?.baseline).toBe(1);
		expect(row(matrix, "semanticSelection.correctSelectionRate")?.baseline).toBe(0.56);
	});

	it("keeps known schema drift explicit instead of synthesizing values", () => {
		const baselineReports: Record<string, string> = {};
		for (const config of DOMAIN_REPORT_CONFIGS) {
			baselineReports[config.baselineReport] = readRepoFile(config.baselineReport);
		}
		const matrix = buildRegressionMatrix({ baselineReports, currentReports: null });
		const reportedMetrics = row(matrix, "retrieval.reportedMetrics");
		expect(reportedMetrics?.baseline).toBe(null);
		expect(reportedMetrics?.status).toBe("BLOCKED");
		const ambiguous = row(matrix, "realWorld.ambiguousEvidenceFailClosedRate");
		expect(ambiguous?.baseline).toBe(null);
		expect(ambiguous?.status).toBe("BLOCKED");
		const jobReady = row(matrix, "jobReadyRag.reportedMetrics");
		expect(jobReady?.baseline).toBe(null);
		expect(jobReady?.status).toBe("BLOCKED");
		expect(jobReady?.source.note).toContain("no tracked report artifact");
	});
});

// --- domain report configuration anchoring ------------------------------------

describe("domain report configuration anchoring", () => {
	it("anchors every configured report path to the manifest reportSource of its domain", () => {
		const reportSourcesByDomain = new Map<string, string[]>();
		for (const rubric of GOVERNANCE_RUBRICS) {
			if (rubric.reportSource === undefined) continue;
			const existing = reportSourcesByDomain.get(rubric.domain) ?? [];
			if (existing.length === 0) reportSourcesByDomain.set(rubric.domain, [...rubric.reportSource]);
		}
		for (const config of DOMAIN_REPORT_CONFIGS) {
			const sources = reportSourcesByDomain.get(config.domain);
			expect(sources, config.domain).toBeDefined();
			expect(config.baselineReport, config.domain).toBe(sources?.[0]);
			for (const candidate of config.currentCandidates) {
				expect(sources?.includes(candidate), `${config.domain}: ${candidate}`).toBe(true);
			}
		}
	});

	it("configures exactly the domains that have a manifest reportSource and no others", () => {
		const domainsWithReportSource = new Set<string>();
		for (const rubric of GOVERNANCE_RUBRICS) {
			if (rubric.reportSource !== undefined) domainsWithReportSource.add(rubric.domain);
		}
		const configuredDomains = new Set(DOMAIN_REPORT_CONFIGS.map((config) => config.domain));
		expect([...configuredDomains].sort()).toEqual([...domainsWithReportSource].sort());
	});
});
