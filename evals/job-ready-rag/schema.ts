import type { KnowledgeEntry, KnowledgeKind, KnowledgeStatus } from "../../src/knowledge.ts";

/**
 * Frozen retrieval-evaluation contract types transcribed verbatim from
 * docs/job-ready/ARCHITECTURE_CONTRACT.md section 10.
 *
 * Track D owns this eval package only. These declarations mirror the contract;
 * they do not extend the backend, invent fields, or select GAP-05 quality
 * thresholds. Every parser below fails closed: any deviation from the frozen
 * shape is rejected rather than coerced, so a malformed population or
 * measurement can never be silently scored.
 */

// --- frozen enumerations -------------------------------------------------
// Runtime lists are the single source of truth; the union types are derived so
// the compile-time and runtime contracts cannot drift apart.

export const EXPECTED_ANSWERABILITY = ["answerable", "no_answer", "ambiguous"] as const;
export const ACTUAL_ANSWERABILITY = ["answerable", "no_answer", "ambiguous", "unavailable"] as const;
export const CASE_PROVENANCE = ["human_authored_official_source", "synthetic_isolation_fixture"] as const;
export const RETRIEVAL_MODE = ["lexical", "vector"] as const;
export const CORPUS_PROVENANCE = ["approved_public_benchmark", "synthetic_isolation_fixture"] as const;

// Governance enums are reused from the frozen knowledge module so violation
// detection compares against exactly the literals the runtime admits on.
export const KNOWLEDGE_STATUS: readonly KnowledgeStatus[] = [
	"approved",
	"synthetic_test_only",
	"unapproved",
	"retired",
];
export const KNOWLEDGE_KIND: readonly KnowledgeKind[] = ["faq", "policy", "sop", "reference"];

export type ExpectedAnswerability = (typeof EXPECTED_ANSWERABILITY)[number];
export type ActualAnswerability = (typeof ACTUAL_ANSWERABILITY)[number];
export type CaseProvenance = (typeof CASE_PROVENANCE)[number];
export type RetrievalMode = (typeof RETRIEVAL_MODE)[number];
export type CorpusProvenance = (typeof CORPUS_PROVENANCE)[number];

/**
 * Tenant/store scope a retrieval case runs under. Structurally mirrors
 * `RetrievalContext` (src/index.ts) and `IdentityContext.scope`; declared
 * locally so the eval package never depends on a mutable core barrel and never
 * invents a scope field beyond the existing tenant/store identifiers.
 */
export interface Scope {
	tenantId: string;
	storeId: string;
}

/** One frozen human-authored retrieval evaluation case (contract section 10). */
export interface RetrievalEvalCase {
	caseId: string;
	query: string;
	scope: Scope;
	expectedEvidenceIds: string[];
	expectedAnswerability: ExpectedAnswerability;
	expectedVersions: Record<string, string>;
	expectedSourceRefs: Record<string, string>;
	provenance: CaseProvenance;
	sourceRefs: string[];
	goldReason: string;
}

/** One frozen retrieval measurement produced by an authorized run (section 10). */
export interface RetrievalMeasurement {
	caseId: string;
	sourceCommit: string;
	casesSha256: string;
	corpusSha256: string;
	mode: RetrievalMode;
	embeddingProfileId?: string;
	returnedEvidenceIds: string[];
	admittedEvidenceIds: string[];
	returnedVersions: Record<string, string>;
	actualAnswerability: ActualAnswerability;
	elapsedMs: number;
	errorCategory?: string;
	pass: boolean;
	failureReasons: string[];
}

/**
 * Governance projection of one corpus entry the retrieval population is built
 * from. Carries only the fields needed for deterministic scope/status/version
 * violation detection. Approved public-benchmark entries stay in their frozen
 * source file (`sourcePath`) and are never duplicated into eval reports;
 * synthetic isolation fixtures carry their full ingestable payload separately.
 */
export interface CorpusEntry {
	id: string;
	kind: KnowledgeKind;
	status: KnowledgeStatus;
	version: string;
	updatedAt: string;
	sourceRef: string;
	tenantScope?: string;
	storeScope?: string;
	provenance: CorpusProvenance;
	sourcePath?: string;
}

/**
 * A synthetic isolation fixture in full ingestable `KnowledgeEntry` shape.
 * These must be ingested into the scoped corpus by Integration/Core B for the
 * tenant/store/approval/version negative controls to be meaningful: an entry
 * that is merely absent tests nothing about governance exclusion.
 */
export type SyntheticIsolationFixture = KnowledgeEntry & {
	provenance: "synthetic_isolation_fixture";
};

// --- fail-closed structural guards ---------------------------------------

const RETRIEVAL_EVAL_CASE_KEYS = [
	"caseId",
	"query",
	"scope",
	"expectedEvidenceIds",
	"expectedAnswerability",
	"expectedVersions",
	"expectedSourceRefs",
	"provenance",
	"sourceRefs",
	"goldReason",
] as const;

const RETRIEVAL_MEASUREMENT_REQUIRED_KEYS = [
	"caseId",
	"sourceCommit",
	"casesSha256",
	"corpusSha256",
	"mode",
	"returnedEvidenceIds",
	"admittedEvidenceIds",
	"returnedVersions",
	"actualAnswerability",
	"elapsedMs",
	"pass",
	"failureReasons",
] as const;

const RETRIEVAL_MEASUREMENT_OPTIONAL_KEYS = ["embeddingProfileId", "errorCategory"] as const;

const CORPUS_ENTRY_REQUIRED_KEYS = ["id", "kind", "status", "version", "updatedAt", "sourceRef", "provenance"] as const;
const CORPUS_ENTRY_OPTIONAL_KEYS = ["tenantScope", "storeScope", "sourcePath"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Assert the key set is exactly `required` plus any of `optional`. Extra or
 * missing keys are rejected so a contract shape change cannot slip through.
 */
export function assertKeySet(
	value: Record<string, unknown>,
	required: readonly string[],
	optional: readonly string[] = [],
): void {
	const allowed = new Set<string>([...required, ...optional]);
	for (const key of required) {
		if (!(key in value)) throw new Error(`Missing required key: ${key}.`);
	}
	for (const key of Object.keys(value)) {
		if (!allowed.has(key)) throw new Error(`Unexpected key: ${key}.`);
	}
}

function requireNonEmptyString(value: unknown, name: string): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`${name} must be a non-empty string.`);
	}
	return value;
}

function requireString(value: unknown, name: string): string {
	if (typeof value !== "string") throw new Error(`${name} must be a string.`);
	return value;
}

function requireStringArray(value: unknown, name: string): string[] {
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
		throw new Error(`${name} must be an array of strings.`);
	}
	return [...value];
}

function requireStringRecord(value: unknown, name: string): Record<string, string> {
	if (!isRecord(value)) throw new Error(`${name} must be a record of string to string.`);
	const result: Record<string, string> = {};
	for (const [key, item] of Object.entries(value)) {
		if (typeof item !== "string") throw new Error(`${name} must be a record of string to string.`);
		result[key] = item;
	}
	return result;
}

function requireEnum<T extends string>(value: unknown, allowed: readonly T[], name: string): T {
	if (typeof value !== "string" || !allowed.includes(value as T)) {
		throw new Error(`${name} must be one of: ${allowed.join(", ")}.`);
	}
	return value as T;
}

function requireOptionalString(value: unknown, name: string): string | undefined {
	if (value === undefined) return undefined;
	return requireString(value, name);
}

function requireFiniteNumber(value: unknown, name: string): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`${name} must be a finite number.`);
	}
	return value;
}

function requireBoolean(value: unknown, name: string): boolean {
	if (typeof value !== "boolean") throw new Error(`${name} must be a boolean.`);
	return value;
}

export function parseScope(value: unknown): Scope {
	if (!isRecord(value)) throw new Error("scope must be an object.");
	assertKeySet(value, ["tenantId", "storeId"]);
	return {
		tenantId: requireNonEmptyString(value.tenantId, "scope.tenantId"),
		storeId: requireNonEmptyString(value.storeId, "scope.storeId"),
	};
}

export function parseRetrievalEvalCase(value: unknown): RetrievalEvalCase {
	if (!isRecord(value)) throw new Error("RetrievalEvalCase must be an object.");
	assertKeySet(value, RETRIEVAL_EVAL_CASE_KEYS);
	return {
		caseId: requireNonEmptyString(value.caseId, "caseId"),
		query: requireNonEmptyString(value.query, "query"),
		scope: parseScope(value.scope),
		expectedEvidenceIds: requireStringArray(value.expectedEvidenceIds, "expectedEvidenceIds"),
		expectedAnswerability: requireEnum(value.expectedAnswerability, EXPECTED_ANSWERABILITY, "expectedAnswerability"),
		expectedVersions: requireStringRecord(value.expectedVersions, "expectedVersions"),
		expectedSourceRefs: requireStringRecord(value.expectedSourceRefs, "expectedSourceRefs"),
		provenance: requireEnum(value.provenance, CASE_PROVENANCE, "provenance"),
		sourceRefs: requireStringArray(value.sourceRefs, "sourceRefs"),
		goldReason: requireNonEmptyString(value.goldReason, "goldReason"),
	};
}

export function parseRetrievalMeasurement(value: unknown): RetrievalMeasurement {
	if (!isRecord(value)) throw new Error("RetrievalMeasurement must be an object.");
	assertKeySet(value, RETRIEVAL_MEASUREMENT_REQUIRED_KEYS, RETRIEVAL_MEASUREMENT_OPTIONAL_KEYS);
	const measurement: RetrievalMeasurement = {
		caseId: requireNonEmptyString(value.caseId, "caseId"),
		sourceCommit: requireNonEmptyString(value.sourceCommit, "sourceCommit"),
		casesSha256: requireNonEmptyString(value.casesSha256, "casesSha256"),
		corpusSha256: requireNonEmptyString(value.corpusSha256, "corpusSha256"),
		mode: requireEnum(value.mode, RETRIEVAL_MODE, "mode"),
		returnedEvidenceIds: requireStringArray(value.returnedEvidenceIds, "returnedEvidenceIds"),
		admittedEvidenceIds: requireStringArray(value.admittedEvidenceIds, "admittedEvidenceIds"),
		returnedVersions: requireStringRecord(value.returnedVersions, "returnedVersions"),
		actualAnswerability: requireEnum(value.actualAnswerability, ACTUAL_ANSWERABILITY, "actualAnswerability"),
		elapsedMs: requireFiniteNumber(value.elapsedMs, "elapsedMs"),
		pass: requireBoolean(value.pass, "pass"),
		failureReasons: requireStringArray(value.failureReasons, "failureReasons"),
	};
	const embeddingProfileId = requireOptionalString(value.embeddingProfileId, "embeddingProfileId");
	if (embeddingProfileId !== undefined) measurement.embeddingProfileId = embeddingProfileId;
	const errorCategory = requireOptionalString(value.errorCategory, "errorCategory");
	if (errorCategory !== undefined) measurement.errorCategory = errorCategory;
	if (measurement.elapsedMs < 0) throw new Error("elapsedMs must not be negative.");
	if (measurement.mode === "vector" && embeddingProfileId === undefined) {
		throw new Error("vector measurements must declare an embeddingProfileId.");
	}
	return measurement;
}

export function parseCorpusEntry(value: unknown): CorpusEntry {
	if (!isRecord(value)) throw new Error("CorpusEntry must be an object.");
	assertKeySet(value, CORPUS_ENTRY_REQUIRED_KEYS, CORPUS_ENTRY_OPTIONAL_KEYS);
	const entry: CorpusEntry = {
		id: requireNonEmptyString(value.id, "id"),
		kind: requireEnum(value.kind, KNOWLEDGE_KIND, "kind"),
		status: requireEnum(value.status, KNOWLEDGE_STATUS, "status"),
		version: requireNonEmptyString(value.version, "version"),
		updatedAt: requireNonEmptyString(value.updatedAt, "updatedAt"),
		sourceRef: requireNonEmptyString(value.sourceRef, "sourceRef"),
		provenance: requireEnum(value.provenance, CORPUS_PROVENANCE, "provenance"),
	};
	const tenantScope = requireOptionalString(value.tenantScope, "tenantScope");
	if (tenantScope !== undefined) entry.tenantScope = tenantScope;
	const storeScope = requireOptionalString(value.storeScope, "storeScope");
	if (storeScope !== undefined) entry.storeScope = storeScope;
	const sourcePath = requireOptionalString(value.sourcePath, "sourcePath");
	if (sourcePath !== undefined) entry.sourcePath = sourcePath;
	if (entry.storeScope !== undefined && entry.tenantScope === undefined) {
		throw new Error(`CorpusEntry ${entry.id} storeScope requires tenantScope.`);
	}
	return entry;
}
