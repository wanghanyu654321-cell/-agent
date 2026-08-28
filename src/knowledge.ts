import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RetrievalContext, RetrievalEvidence, RetrievalService } from "./index.ts";

export type KnowledgeStatus = "approved" | "synthetic_test_only" | "unapproved" | "retired";
export type KnowledgeKind = "faq" | "policy" | "sop" | "reference";

export interface KnowledgeEntry {
	id: string;
	kind: KnowledgeKind;
	status: KnowledgeStatus;
	title: string;
	content: string;
	version: string;
	updatedAt: string;
	tenantScope?: string;
	storeScope?: string;
	sourceRef: string;
	tags: string[];
}

export interface KnowledgeEvidenceMetadata {
	kind: KnowledgeKind;
	status: KnowledgeStatus;
	version: string;
	sourceRef: string;
	tenantScope?: string;
	storeScope?: string;
}

export interface GroundingReference {
	id: string;
	version: string;
	sourceRef: string;
	kind: KnowledgeKind;
}

export interface GovernedKnowledgeRetrievalOptions {
	allowSyntheticTestFixtures?: boolean;
}

const statuses = new Set<KnowledgeStatus>(["approved", "synthetic_test_only", "unapproved", "retired"]);
const kinds = new Set<KnowledgeKind>(["faq", "policy", "sop", "reference"]);

function requiredString(value: unknown, name: string, id?: string): asserts value is string {
	if (typeof value !== "string" || value.trim().length === 0)
		throw new Error(`Knowledge entry ${id ?? ""} ${name} is required.`);
}

function validIsoDate(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	return Number.isFinite(Date.parse(`${value}T00:00:00.000Z`));
}

export function validateKnowledgeEntries(entries: KnowledgeEntry[]): void {
	const ids = new Set<string>();
	for (const entry of entries) {
		requiredString(entry.id, "id");
		if (ids.has(entry.id)) throw new Error(`Knowledge entry duplicate id: ${entry.id}.`);
		ids.add(entry.id);
		if (!statuses.has(entry.status)) throw new Error(`Knowledge entry ${entry.id} has unsupported status.`);
		if (!kinds.has(entry.kind)) throw new Error(`Knowledge entry ${entry.id} has unsupported kind.`);
		requiredString(entry.title, "title", entry.id);
		requiredString(entry.content, "content", entry.id);
		requiredString(entry.version, "version", entry.id);
		requiredString(entry.sourceRef, "sourceRef", entry.id);
		if (!validIsoDate(entry.updatedAt)) throw new Error(`Knowledge entry ${entry.id} updatedAt must be an ISO date.`);
		if (!Array.isArray(entry.tags) || entry.tags.some((tag) => typeof tag !== "string" || tag.trim().length === 0)) {
			throw new Error(`Knowledge entry ${entry.id} tags must be non-empty strings.`);
		}
		if (entry.storeScope && !entry.tenantScope) {
			throw new Error(`Knowledge entry ${entry.id} storeScope requires tenantScope.`);
		}
	}
}

export function loadKnowledgeEntriesFromDirectory(directory: string): KnowledgeEntry[] {
	const entries: KnowledgeEntry[] = [];
	for (const file of readdirSync(directory, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
		.sort((left, right) => left.name.localeCompare(right.name))) {
		const path = join(directory, file.name);
		let parsed: unknown;
		try {
			parsed = JSON.parse(readFileSync(path, "utf8"));
		} catch {
			throw new Error(`Knowledge file ${file.name} could not be parsed.`);
		}
		const items = Array.isArray(parsed) ? parsed : [parsed];
		if (items.some((item) => item === null || typeof item !== "object")) {
			throw new Error(`Knowledge file ${file.name} must contain knowledge entries.`);
		}
		entries.push(...(items as KnowledgeEntry[]));
	}
	validateKnowledgeEntries(entries);
	return entries;
}

export function knowledgeScopeAllows(
	metadata: KnowledgeEvidenceMetadata,
	context: RetrievalContext | undefined,
): boolean {
	if (!context) return metadata.tenantScope === undefined && metadata.storeScope === undefined;
	if (metadata.tenantScope !== undefined && metadata.tenantScope !== context.tenantId) return false;
	if (metadata.storeScope !== undefined && metadata.storeScope !== context.storeId) return false;
	return true;
}

export function isAdmissibleKnowledgeEvidence(
	metadata: KnowledgeEvidenceMetadata | undefined,
	context: RetrievalContext | undefined,
	allowSyntheticTestFixtures: boolean,
): metadata is KnowledgeEvidenceMetadata {
	if (!metadata || !knowledgeScopeAllows(metadata, context)) return false;
	return metadata.status === "approved" || (allowSyntheticTestFixtures && metadata.status === "synthetic_test_only");
}

function normalizedTerms(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[\s，。！？、；：“”‘’,.!?;:'"-]+/)
		.map((term) => term.trim())
		.filter((term) => term.length > 0);
}

function matches(entry: KnowledgeEntry, query: string): boolean {
	const haystack = `${entry.title}\n${entry.content}\n${entry.tags.join(" ")}`.toLowerCase();
	const terms = normalizedTerms(query);
	return terms.length > 0 && terms.every((term) => haystack.includes(term));
}

function metadata(entry: KnowledgeEntry): KnowledgeEvidenceMetadata {
	return {
		kind: entry.kind,
		status: entry.status,
		version: entry.version,
		sourceRef: entry.sourceRef,
		...(entry.tenantScope ? { tenantScope: entry.tenantScope } : {}),
		...(entry.storeScope ? { storeScope: entry.storeScope } : {}),
	};
}

export function groundingReference(evidence: RetrievalEvidence): GroundingReference | undefined {
	if (!evidence.knowledge) return undefined;
	return {
		id: evidence.id,
		version: evidence.knowledge.version,
		sourceRef: evidence.knowledge.sourceRef,
		kind: evidence.knowledge.kind,
	};
}

export class GovernedKnowledgeRetrievalService implements RetrievalService {
	private readonly entries: KnowledgeEntry[];
	private readonly allowSyntheticTestFixtures: boolean;

	constructor(entries: KnowledgeEntry[], options: GovernedKnowledgeRetrievalOptions = {}) {
		validateKnowledgeEntries(entries);
		this.entries = entries.map((entry) => ({ ...entry, tags: [...entry.tags] }));
		this.allowSyntheticTestFixtures = options.allowSyntheticTestFixtures ?? false;
	}

	async search(query: string, signal: AbortSignal, context?: RetrievalContext): Promise<RetrievalEvidence[]> {
		if (signal.aborted) throw new Error("Governed knowledge search aborted.");
		return this.entries
			.filter((entry) => matches(entry, query))
			.filter((entry) => isAdmissibleKnowledgeEvidence(metadata(entry), context, this.allowSyntheticTestFixtures))
			.map((entry) => ({ id: entry.id, text: entry.content, knowledge: metadata(entry) }));
	}
}
