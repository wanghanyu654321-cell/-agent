import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GOVERNANCE_RUBRICS } from "../governance/manifest.ts";
import { buildRegressionMatrix } from "./compare.ts";
import {
	DOMAIN_REPORT_CONFIGS,
	type HardInvariantViolation,
	type MatrixRow,
	type RegressionMatrix,
} from "./normalize.ts";

/**
 * Unified regression matrix entry point (Evaluation Governance Consolidation V1,
 * Workstream B).
 *
 * A deterministic, side-plane aggregator ONLY: it reads existing tracked report
 * artifacts and caller-supplied current reports, compares them row by row, and
 * renders a machine-readable canonical JSON plus a human-readable Markdown
 * matrix. It computes no overall/blended agent score, re-runs no evaluator,
 * blocks no CI gate, and never writes into any tracked report path (output goes
 * to stdout, or to an explicit --out prefix chosen by the caller).
 *
 * Usage (plain node, no new dependencies):
 *   node evals/regression/matrix.ts [--current <dir>] [--out <prefix>]
 *
 * --current <dir>: a directory mirroring the repository-relative report layout
 * (e.g. <dir>/evals/safety/reports/latest.json). Each domain's current report
 * is looked up among its manifest reportSource paths, in order. Domains whose
 * current report is absent get BLOCKED rows — never synthesized values.
 * --out <prefix>: writes <prefix>.json and <prefix>.md in addition to printing
 * the Markdown to stdout. Refuses to overwrite any tracked report path.
 */

// --- canonical JSON (deterministic serialization, freeze.ts pattern) --------

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value !== null && typeof value === "object") {
		const record = value as Record<string, unknown>;
		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(record).sort()) {
			if (record[key] !== undefined) sorted[key] = canonicalize(record[key]);
		}
		return sorted;
	}
	return value;
}

/** Canonical JSON: objects keyed in sorted order, arrays order-preserved. */
export function canonicalJson(value: unknown): string {
	return JSON.stringify(canonicalize(value));
}

// --- human-readable Markdown rendering ---------------------------------------

function formatValue(value: number | null): string {
	return value === null ? "unavailable" : String(value);
}

function formatSource(row: MatrixRow): string {
	const parts: string[] = [];
	parts.push(`baseline: ${row.source.baselineReport ?? "none"}`);
	parts.push(`current: ${row.source.currentReport ?? "none"}`);
	if (row.source.note !== null) parts.push(row.source.note);
	return parts.join("; ");
}

function renderViolations(violations: readonly HardInvariantViolation[]): string[] {
	const lines: string[] = [];
	lines.push("## Hard invariant violations (exact-value `===` invariants; cannot be offset by any improvement)");
	lines.push("");
	if (violations.length === 0) {
		lines.push("_None._");
		lines.push("");
		return lines;
	}
	lines.push("| domain | rubric | metric | threshold | baseline | current |");
	lines.push("| --- | --- | --- | --- | --- | --- |");
	for (const violation of violations) {
		lines.push(
			`| ${violation.domain} | ${violation.rubricId} | ${violation.metric} | ${violation.threshold} | ${formatValue(violation.baseline)} | ${formatValue(violation.current)} |`,
		);
	}
	lines.push("");
	return lines;
}

function renderRows(rows: readonly MatrixRow[]): string[] {
	const lines: string[] = [];
	lines.push("## Matrix rows");
	lines.push("");
	lines.push("| domain | rubric | metric | baseline | current | status | gate class | source |");
	lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
	for (const row of rows) {
		lines.push(
			`| ${row.domain} | ${row.rubricId} | ${row.metric} | ${formatValue(row.baseline)} | ${formatValue(row.current)} | ${row.status} | ${row.gateClass} | ${formatSource(row)} |`,
		);
	}
	lines.push("");
	return lines;
}

/** Renders the matrix as deterministic Markdown (violations section always first). */
export function renderMarkdown(matrix: RegressionMatrix): string {
	const lines: string[] = [];
	lines.push("# Unified regression matrix");
	lines.push("");
	lines.push(`- manifest: ${matrix.manifestVersion}`);
	lines.push(`- matrix layer: ${matrix.matrixLayer}`);
	lines.push(`- rows: ${matrix.rows.length}`);
	lines.push("");
	lines.push(...renderViolations(matrix.hardInvariantViolations));
	lines.push(...renderRows(matrix.rows));
	lines.push("## Status counts (independent counts, not a blended or averaged score)");
	lines.push("");
	lines.push(`- IMPROVED: ${matrix.statusCounts.improved}`);
	lines.push(`- UNCHANGED: ${matrix.statusCounts.unchanged}`);
	lines.push(`- REGRESSED: ${matrix.statusCounts.regressed}`);
	lines.push(`- BLOCKED: ${matrix.statusCounts.blocked}`);
	lines.push("");
	return lines.join("\n");
}

// --- CLI (plain node main; no new dependencies) ------------------------------

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

interface CliOptions {
	readonly currentDir: string | null;
	readonly outPrefix: string | null;
}

function parseArgs(argv: readonly string[]): CliOptions {
	let currentDir: string | null = null;
	let outPrefix: string | null = null;
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--current" || argument === "--out") {
			const value = argv[index + 1];
			if (value === undefined || value === "") {
				throw new Error(`missing value for ${argument}`);
			}
			if (argument === "--current") currentDir = value;
			else outPrefix = value;
			index += 1;
		} else {
			throw new Error(`unknown argument: ${argument} (expected --current <dir> or --out <prefix>)`);
		}
	}
	return { currentDir, outPrefix };
}

function collectBaselineReports(): Record<string, string> {
	const baselineReports: Record<string, string> = {};
	for (const config of DOMAIN_REPORT_CONFIGS) {
		const absolute = join(repoRoot, config.baselineReport);
		if (existsSync(absolute)) baselineReports[config.baselineReport] = readFileSync(absolute, "utf8");
	}
	return baselineReports;
}

function collectCurrentReports(currentDir: string): Record<string, string> {
	const resolved = isAbsolute(currentDir) ? currentDir : resolve(repoRoot, currentDir);
	if (!existsSync(resolved)) {
		throw new Error(`--current directory does not exist: ${resolved}`);
	}
	if (!statSync(resolved).isDirectory()) {
		throw new Error(`--current must be a directory mirroring the repository-relative report layout: ${resolved}`);
	}
	const currentReports: Record<string, string> = {};
	for (const config of DOMAIN_REPORT_CONFIGS) {
		for (const candidate of config.currentCandidates) {
			const absolute = join(resolved, candidate);
			if (existsSync(absolute)) {
				currentReports[candidate] = readFileSync(absolute, "utf8");
				break;
			}
		}
	}
	return currentReports;
}

/** Refuses to write into any path that is (or overrides) a tracked report artifact. */
function assertSafeOutputPath(outJsonPath: string, outMarkdownPath: string): void {
	const trackedReportPaths = new Set<string>();
	for (const rubric of GOVERNANCE_RUBRICS) {
		for (const reportPath of rubric.reportSource ?? []) trackedReportPaths.add(reportPath);
	}
	for (const config of DOMAIN_REPORT_CONFIGS) {
		trackedReportPaths.add(config.baselineReport);
		for (const candidate of config.currentCandidates) trackedReportPaths.add(candidate);
	}
	for (const output of [outJsonPath, outMarkdownPath]) {
		for (const tracked of trackedReportPaths) {
			if (resolve(output) === resolve(repoRoot, tracked)) {
				throw new Error(`refusing to overwrite tracked report artifact: ${tracked}`);
			}
		}
	}
}

async function main(): Promise<void> {
	let options: CliOptions;
	try {
		options = parseArgs(process.argv.slice(2));
	} catch (error) {
		console.error(`regression matrix: ${(error as Error).message}`);
		process.exitCode = 2;
		return;
	}

	const baselineReports = collectBaselineReports();
	const currentReports = options.currentDir === null ? null : collectCurrentReports(options.currentDir);

	const matrix = buildRegressionMatrix({ baselineReports, currentReports });
	const markdown = renderMarkdown(matrix);
	console.log(markdown);

	if (options.outPrefix !== null) {
		const outJsonPath = `${options.outPrefix}.json`;
		const outMarkdownPath = `${options.outPrefix}.md`;
		assertSafeOutputPath(outJsonPath, outMarkdownPath);
		writeFileSync(outJsonPath, `${canonicalJson(matrix)}\n`, "utf8");
		writeFileSync(outMarkdownPath, `${markdown}\n`, "utf8");
	}
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) void main();
