import { createHash } from "node:crypto";
import { jobReadyRetrievalCases, NEGATIVE_CONTROLS } from "./cases.ts";
import { jobReadyCorpus } from "./corpus.ts";
import type { CorpusEntry, RetrievalEvalCase } from "./schema.ts";
import { parseCorpusEntry, parseRetrievalEvalCase } from "./schema.ts";

/**
 * Deterministic population freeze (contract section 10: "Final
 * population/hashes freeze before comparison"). Hashes are stable across runs
 * and key-insertion order because the population is canonicalized before
 * hashing. No timestamp or machine-dependent value enters any digest.
 */

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

export function sha256Hex(text: string): string {
	return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Stable sha256 of a population, independent of key-insertion order. */
export function hashPopulation(value: unknown): string {
	return sha256Hex(canonicalJson(value));
}

const REQUIRED_DIMENSIONS = ["tenant_isolation", "store_isolation", "unapproved_evidence", "stale_version"] as const;

function countBy(
	cases: readonly RetrievalEvalCase[],
	answerability: RetrievalEvalCase["expectedAnswerability"],
): number {
	return cases.filter((item) => item.expectedAnswerability === answerability).length;
}

/**
 * Fail-closed validation of the frozen population. Any structural drift,
 * gold/corpus mismatch, count deviation, or missing negative-control dimension
 * throws so a broken population can never be hashed or scored.
 */
export function assertValidPopulation(
	cases: readonly RetrievalEvalCase[] = jobReadyRetrievalCases,
	corpus: readonly CorpusEntry[] = jobReadyCorpus,
): void {
	const corpusById = new Map<string, CorpusEntry>();
	for (const entry of corpus) {
		parseCorpusEntry(entry);
		if (corpusById.has(entry.id)) throw new Error(`Duplicate corpus entry id: ${entry.id}.`);
		corpusById.set(entry.id, entry);
	}

	if (cases.length !== 40) throw new Error(`Frozen population must have exactly 40 cases, found ${cases.length}.`);
	const answerable = countBy(cases, "answerable");
	const noAnswer = countBy(cases, "no_answer");
	const ambiguousCount = countBy(cases, "ambiguous");
	if (answerable !== 24 || noAnswer !== 8 || ambiguousCount !== 8) {
		throw new Error(`Case split must be 24/8/8, found ${answerable}/${noAnswer}/${ambiguousCount}.`);
	}

	const seenCaseIds = new Set<string>();
	for (const item of cases) {
		parseRetrievalEvalCase(item);
		if (seenCaseIds.has(item.caseId)) throw new Error(`Duplicate caseId: ${item.caseId}.`);
		seenCaseIds.add(item.caseId);
		if (item.goldReason.trim().length < 8) throw new Error(`Case ${item.caseId} goldReason must explain gold.`);

		for (const id of item.expectedEvidenceIds) {
			const entry = corpusById.get(id);
			if (!entry) throw new Error(`Case ${item.caseId} gold ${id} is not in the frozen corpus.`);
			if (item.expectedVersions[id] !== entry.version) {
				throw new Error(`Case ${item.caseId} expectedVersions for ${id} must equal the corpus version.`);
			}
			if (item.expectedSourceRefs[id] !== entry.sourceRef) {
				throw new Error(`Case ${item.caseId} expectedSourceRefs for ${id} must equal the corpus sourceRef.`);
			}
		}

		if (item.expectedAnswerability === "answerable") {
			if (item.expectedEvidenceIds.length !== 1) {
				throw new Error(`Answerable case ${item.caseId} must have exactly one sufficient gold entry.`);
			}
			if (item.provenance !== "human_authored_official_source") {
				throw new Error(`Answerable case ${item.caseId} must be human_authored_official_source.`);
			}
		}
		if (item.expectedAnswerability === "ambiguous") {
			const distinct = new Set(item.expectedEvidenceIds);
			if (distinct.size < 2) {
				throw new Error(`Ambiguous case ${item.caseId} must have at least two distinct plausible gold entries.`);
			}
			if (item.provenance !== "human_authored_official_source") {
				throw new Error(`Ambiguous case ${item.caseId} must be human_authored_official_source.`);
			}
		}
		if (item.expectedAnswerability === "no_answer") {
			if (item.expectedEvidenceIds.length !== 0) {
				throw new Error(`No-answer case ${item.caseId} must have empty gold.`);
			}
			if (item.provenance !== "synthetic_isolation_fixture") {
				throw new Error(`No-answer case ${item.caseId} must be synthetic_isolation_fixture.`);
			}
		}
	}

	const controlIds = Object.keys(NEGATIVE_CONTROLS);
	if (controlIds.length < 8)
		throw new Error(`At least 8 explicit negative controls are required, found ${controlIds.length}.`);
	const dimensions = new Set<string>();
	for (const caseId of controlIds) {
		const target = cases.find((item) => item.caseId === caseId);
		if (!target || target.expectedAnswerability !== "no_answer") {
			throw new Error(`Negative control ${caseId} must be a no-answer case.`);
		}
		const control = NEGATIVE_CONTROLS[caseId];
		dimensions.add(control.dimension);
		for (const excludedId of control.excludedEntryIds) {
			const entry = corpusById.get(excludedId);
			if (!entry) throw new Error(`Negative control ${caseId} excludes unknown corpus entry ${excludedId}.`);
			if (entry.provenance !== "synthetic_isolation_fixture") {
				throw new Error(`Negative control ${caseId} must exclude a synthetic isolation fixture.`);
			}
		}
	}
	for (const dimension of REQUIRED_DIMENSIONS) {
		if (!dimensions.has(dimension)) throw new Error(`Negative controls must cover dimension: ${dimension}.`);
	}
}

export interface FrozenPopulation {
	casesSha256: string;
	corpusSha256: string;
	caseCount: number;
	answerableCount: number;
	noAnswerCount: number;
	ambiguousCount: number;
	negativeControlCount: number;
	negativeControlDimensions: string[];
	corpusEntryCount: number;
	approvedEntryCount: number;
	syntheticFixtureCount: number;
	humanAuthoredCaseCount: number;
	syntheticFixtureCaseCount: number;
}

/** Validate then freeze the population, returning the binding digests. */
export function freezePopulation(
	cases: readonly RetrievalEvalCase[] = jobReadyRetrievalCases,
	corpus: readonly CorpusEntry[] = jobReadyCorpus,
): FrozenPopulation {
	assertValidPopulation(cases, corpus);
	const dimensions = [...new Set(Object.values(NEGATIVE_CONTROLS).map((control) => control.dimension))].sort();
	return {
		casesSha256: hashPopulation(cases),
		corpusSha256: hashPopulation(corpus),
		caseCount: cases.length,
		answerableCount: countBy(cases, "answerable"),
		noAnswerCount: countBy(cases, "no_answer"),
		ambiguousCount: countBy(cases, "ambiguous"),
		negativeControlCount: Object.keys(NEGATIVE_CONTROLS).length,
		negativeControlDimensions: dimensions,
		corpusEntryCount: corpus.length,
		approvedEntryCount: corpus.filter((entry) => entry.provenance === "approved_public_benchmark").length,
		syntheticFixtureCount: corpus.filter((entry) => entry.provenance === "synthetic_isolation_fixture").length,
		humanAuthoredCaseCount: cases.filter((item) => item.provenance === "human_authored_official_source").length,
		syntheticFixtureCaseCount: cases.filter((item) => item.provenance === "synthetic_isolation_fixture").length,
	};
}
