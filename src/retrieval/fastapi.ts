import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { RetrievalContext, RetrievalEvidence, RetrievalService } from "../index.ts";
import { isAdmissibleKnowledgeEvidence, type KnowledgeEntry, validateKnowledgeEntries } from "../knowledge.ts";

export type Scope = RetrievalContext;
export interface SearchRequest {
	schemaVersion: "job-ready-v1";
	requestId: string;
	scope: Scope;
	query: string;
	topK: 3;
	embeddingProfileId: string;
}
export interface CandidateEvidence {
	chunkId: string;
	documentId: string;
	version: string;
	sourceRef: string;
	kind: "policy" | "sop" | "reference";
	scope: Scope;
	status: "approved";
	contentSha256: string;
	chunkSha256: string;
	text: string;
	score: number;
	rank: number;
	embeddingProfileId: string;
}
export interface SearchResponse {
	schemaVersion: "job-ready-v1";
	requestId: string;
	candidates: CandidateEvidence[];
}
export interface IngestRequest {
	schemaVersion: "job-ready-v1";
	requestId: string;
	scope: Scope;
	documentId: string;
	version: string;
	contentSha256: string;
	embeddingProfileId: string;
}
export interface IngestResponse {
	schemaVersion: "job-ready-v1";
	requestId: string;
	documentId: string;
	version: string;
	contentSha256: string;
	embeddingProfileId: string;
	chunkCount: number;
	outcome: "indexed" | "already_indexed";
}
export interface RegisteredChunk {
	chunkId: string;
	ordinal: number;
	text: string;
	chunkSha256: string;
	embeddingProfileId: string;
}
export interface RegisteredDocument {
	entry: KnowledgeEntry;
	active: boolean;
	contentSha256: string;
	chunks: RegisteredChunk[];
}
/** A current, uncached Node-owned registry read; never supplied by Python or browser. */
export interface RagRegistry {
	current(scope: Scope, documentIds: string[], profileId: string, signal: AbortSignal): Promise<RegisteredDocument[]>;
}
export class PostgresRagRegistry implements RagRegistry {
	constructor(private readonly pool: Pool) {}
	private async connection<T>(signal: AbortSignal, operation: (client: PoolClient) => Promise<T>): Promise<T> {
		requireValue(!signal.aborted);
		const connecting = this.pool.connect();
		// A connection acquired after cancellation must not leak from the pool.
		void connecting.then(
			(client) => {
				if (signal.aborted) client.release(true);
			},
			() => {},
		);
		const client = await abortable(connecting, signal);
		let released = false;
		const abort = () => {
			if (!released) {
				released = true;
				client.release(true);
			}
		};
		signal.addEventListener("abort", abort, { once: true });
		try {
			requireValue(!signal.aborted);
			return await abortable(operation(client), signal);
		} catch {
			throw unavailable();
		} finally {
			signal.removeEventListener("abort", abort);
			if (!released) {
				released = true;
				client.release();
			}
		}
	}
	/** Trusted operator only, after the existing private-corpus loader. No model writes. */
	async register(entries: KnowledgeEntry[], scope: Scope, signal: AbortSignal): Promise<void> {
		const approved = validatePrivateRegistration(entries, scope).sort((a, b) =>
			a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
		);
		return this.connection(signal, async (client) => {
			await client.query("BEGIN");
			try {
				for (const entry of approved) {
					requireValue(!signal.aborted);
					// Across versions too: prevent races between two active-version registrations.
					await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
						JSON.stringify([scope.tenantId, scope.storeId, entry.id]),
					]);
					const found = await client.query(
						"SELECT *,to_char(updated_date,'YYYY-MM-DD') AS date_text FROM rag_documents WHERE tenant_id=$1 AND store_id=$2 AND document_id=$3 AND version=$4 FOR UPDATE",
						[scope.tenantId, scope.storeId, entry.id, entry.version],
					);
					if (found.rows.length) {
						const row = found.rows[0];
						requireValue(
							row.active &&
								row.status === "approved" &&
								row.content === entry.content &&
								row.content_sha256 === sha256(entry.content) &&
								row.source_ref === entry.sourceRef &&
								row.kind === entry.kind &&
								row.title === entry.title &&
								row.date_text === entry.updatedAt &&
								JSON.stringify(row.tags) === JSON.stringify(entry.tags),
						);
						continue;
					}
					await client.query(
						"UPDATE rag_documents SET active=false,status='retired' WHERE tenant_id=$1 AND store_id=$2 AND document_id=$3 AND active",
						[scope.tenantId, scope.storeId, entry.id],
					);
					await client.query(
						"INSERT INTO rag_documents (tenant_id,store_id,document_id,version,kind,title,content,content_sha256,source_ref,updated_date,tags,status,active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,'approved',true)",
						[
							scope.tenantId,
							scope.storeId,
							entry.id,
							entry.version,
							entry.kind,
							entry.title,
							entry.content,
							sha256(entry.content),
							entry.sourceRef,
							entry.updatedAt,
							JSON.stringify(entry.tags),
						],
					);
				}
				requireValue(!signal.aborted);
				await client.query("COMMIT");
			} catch {
				if (!signal.aborted) await client.query("ROLLBACK");
				throw unavailable();
			}
		});
	}
	async current(scope: Scope, ids: string[], profile: string, signal: AbortSignal): Promise<RegisteredDocument[]> {
		scopeValue(scope);
		stringValue(profile);
		requireValue(ids.length <= 3);
		for (const id of ids) stringValue(id);
		return this.connection(signal, async (client) => {
			const result = await client.query(
				`SELECT d.*,to_char(d.updated_date,'YYYY-MM-DD') AS date_text,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('chunkId',c.chunk_id,'ordinal',c.ordinal,'text',c.text,'chunkSha256',c.chunk_sha256,'embeddingProfileId',c.embedding_profile_id) ORDER BY c.ordinal)
     FROM rag_chunks c WHERE c.tenant_id=d.tenant_id AND c.store_id=d.store_id AND c.document_id=d.document_id AND c.version=d.version AND c.embedding_profile_id=$4),'[]'::jsonb) AS chunks
    FROM rag_documents d WHERE d.tenant_id=$1 AND d.store_id=$2 AND d.document_id=ANY($3::text[]) AND d.active AND d.status='approved'`,
				[scope.tenantId, scope.storeId, ids, profile],
			);
			return result.rows.map((row) => ({
				active: row.active,
				contentSha256: row.content_sha256,
				chunks: row.chunks,
				entry: {
					id: row.document_id,
					kind: row.kind,
					status: row.status,
					title: row.title,
					content: row.content,
					version: row.version,
					updatedAt: row.date_text,
					sourceRef: row.source_ref,
					tags: row.tags,
					tenantScope: row.tenant_id,
					storeScope: row.store_id,
				},
			}));
		});
	}
}
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const unavailable = () => new Error("retrieval_unavailable");
function requireValue(condition: unknown): asserts condition {
	if (!condition) throw unavailable();
}
function stringValue(value: unknown, limit = 200, allowWhitespace = false): asserts value is string {
	requireValue(
		typeof value === "string" &&
			(allowWhitespace ? value.length > 0 : value.trim().length > 0) &&
			value.isWellFormed() &&
			!value.includes("\0") &&
			[...value].length <= limit,
	);
}
function exactObject(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
	requireValue(value !== null && typeof value === "object" && !Array.isArray(value));
	const actual = Object.keys(value);
	requireValue(actual.length === keys.length && actual.every((key) => keys.includes(key)));
}
function scopeValue(value: unknown): asserts value is Scope {
	exactObject(value, ["tenantId", "storeId"]);
	stringValue(value.tenantId);
	stringValue(value.storeId);
}
function hashValue(value: unknown): asserts value is string {
	requireValue(typeof value === "string" && /^[a-f0-9]{64}$/.test(value));
}

/** Registration boundary is separate from the unchanged lexical Knowledge core. */
export function validatePrivateRegistration(entries: KnowledgeEntry[], scope: Scope): KnowledgeEntry[] {
	try {
		scopeValue(scope);
		requireValue(entries.length > 0);
		validateKnowledgeEntries(entries);
		for (const entry of entries) {
			stringValue(entry.id);
			stringValue(entry.version);
			stringValue(entry.content, 16000);
			stringValue(entry.sourceRef, 256 * 1024);
			stringValue(entry.title, 16000);
			requireValue(entry.tags.every((tag) => tag.isWellFormed() && !tag.includes("\0")));
			requireValue(
				entry.status === "approved" && entry.tenantScope === scope.tenantId && entry.storeScope === scope.storeId,
			);
		}
		return structuredClone(entries);
	} catch {
		throw unavailable();
	}
}
export function canonicalChunks(entry: KnowledgeEntry, embeddingProfileId: string): RegisteredChunk[] {
	stringValue(embeddingProfileId);
	const scope = { tenantId: entry.tenantScope!, storeId: entry.storeScope! };
	validatePrivateRegistration([entry], scope);
	const characters = [...entry.content];
	const chunks: RegisteredChunk[] = [];
	for (let offset = 0; offset < characters.length; offset += 2000) {
		const text = characters.slice(offset, offset + 2000).join("");
		const ordinal = chunks.length;
		const chunkSha256 = sha256(text);
		const chunkId = sha256(
			JSON.stringify([
				scope.tenantId,
				scope.storeId,
				entry.id,
				entry.version,
				embeddingProfileId,
				ordinal,
				chunkSha256,
			]),
		);
		chunks.push({ chunkId, ordinal, text, chunkSha256, embeddingProfileId });
	}
	return chunks;
}

function validateCompleteChunkGeneration(
	entry: KnowledgeEntry,
	storedChunks: RegisteredChunk[],
	embeddingProfileId: string,
): void {
	const expectedChunks = canonicalChunks(entry, embeddingProfileId);
	requireValue(Array.isArray(storedChunks) && storedChunks.length === expectedChunks.length);
	for (const expected of expectedChunks) {
		const matches = storedChunks.filter((stored) => stored?.ordinal === expected.ordinal);
		requireValue(matches.length === 1);
		const stored = matches[0];
		requireValue(
			stored.chunkId === expected.chunkId &&
				stored.ordinal === expected.ordinal &&
				stored.text === expected.text &&
				stored.chunkSha256 === expected.chunkSha256 &&
				stored.embeddingProfileId === expected.embeddingProfileId,
		);
	}
}
export function validateSearchResponse(value: unknown, request: SearchRequest): SearchResponse {
	exactObject(value, ["schemaVersion", "requestId", "candidates"]);
	requireValue(value.schemaVersion === "job-ready-v1" && value.requestId === request.requestId);
	requireValue(Array.isArray(value.candidates) && value.candidates.length <= 3);
	const documents = new Set<string>();
	for (const [index, c] of value.candidates.entries()) {
		exactObject(c, [
			"chunkId",
			"documentId",
			"version",
			"sourceRef",
			"kind",
			"scope",
			"status",
			"contentSha256",
			"chunkSha256",
			"text",
			"score",
			"rank",
			"embeddingProfileId",
		]);
		stringValue(c.documentId);
		stringValue(c.version);
		stringValue(c.sourceRef, 256 * 1024);
		stringValue(c.text, 2000, true);
		hashValue(c.chunkId);
		hashValue(c.contentSha256);
		hashValue(c.chunkSha256);
		scopeValue(c.scope);
		requireValue(c.scope.tenantId === request.scope.tenantId && c.scope.storeId === request.scope.storeId);
		requireValue(c.status === "approved" && (c.kind === "policy" || c.kind === "sop" || c.kind === "reference"));
		requireValue(c.embeddingProfileId === request.embeddingProfileId && c.rank === index + 1);
		requireValue(typeof c.score === "number" && Number.isFinite(c.score) && c.score >= -1 && c.score <= 1);
		requireValue(!documents.has(c.documentId));
		documents.add(c.documentId);
	}
	return value as unknown as SearchResponse;
}
/** Stop waiting even if an injected dependency ignores abort; reject late completion. */
async function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const abort = () => reject(unavailable());
		signal.addEventListener("abort", abort, { once: true });
		operation.then(
			(value) => {
				signal.removeEventListener("abort", abort);
				if (signal.aborted) reject(unavailable());
				else resolve(value);
			},
			() => {
				signal.removeEventListener("abort", abort);
				reject(unavailable());
			},
		);
		if (signal.aborted) abort();
	});
}
async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
	if (response.status !== 200 || response.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
		void response.body?.cancel().catch(() => {});
		throw unavailable();
	}
	requireValue(response.body);
	const reader = response.body.getReader();
	const abort = () => {
		void reader.cancel().catch(() => {});
	};
	signal.addEventListener("abort", abort, { once: true });
	let length = 0;
	const parts: Uint8Array[] = [];
	try {
		while (true) {
			const part = await abortable(reader.read(), signal);
			if (part.done) break;
			length += part.value.byteLength;
			requireValue(length <= 256 * 1024);
			parts.push(part.value);
		}
		requireValue(!signal.aborted);
		return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts)));
	} finally {
		signal.removeEventListener("abort", abort);
		void reader.cancel().catch(() => {});
		reader.releaseLock();
	}
}
export interface FastApiRetrievalOptions {
	endpoint: string;
	serviceCredential: string;
	embeddingProfileId: string;
	registry: RagRegistry;
	fetch?: typeof globalThis.fetch;
}
export class FastApiRetrievalService implements RetrievalService {
	private readonly endpoint: string;
	private readonly fetcher: typeof globalThis.fetch;
	constructor(private readonly options: FastApiRetrievalOptions) {
		let endpoint: URL;
		try {
			endpoint = new URL(options.endpoint);
		} catch {
			throw unavailable();
		}
		requireValue(
			["http:", "https:"].includes(endpoint.protocol) &&
				!endpoint.username &&
				!endpoint.password &&
				!endpoint.search &&
				!endpoint.hash &&
				endpoint.pathname === "/",
		);
		stringValue(options.serviceCredential, 4096);
		requireValue(!/[\r\n]/.test(options.serviceCredential));
		stringValue(options.embeddingProfileId);
		this.endpoint = endpoint.origin;
		this.fetcher = options.fetch ?? globalThis.fetch;
	}
	private async post(
		path: string,
		body: SearchRequest | IngestRequest,
		limit: number,
		signal: AbortSignal,
	): Promise<unknown> {
		requireValue(!signal.aborted);
		const json = JSON.stringify(body);
		requireValue(Buffer.byteLength(json) <= limit);
		const response = await abortable(
			this.fetcher(`${this.endpoint}${path}`, {
				method: "POST",
				headers: { "content-type": "application/json", authorization: `Bearer ${this.options.serviceCredential}` },
				body: json,
				signal,
				redirect: "error",
				credentials: "omit",
			}),
			signal,
		);
		return boundedJson(response, signal);
	}
	async search(query: string, signal: AbortSignal, context?: RetrievalContext): Promise<RetrievalEvidence[]> {
		try {
			requireValue(!signal.aborted);
			scopeValue(context);
			stringValue(query, 4000);
			const request: SearchRequest = {
				schemaVersion: "job-ready-v1",
				requestId: randomUUID(),
				scope: { ...context },
				query,
				topK: 3,
				embeddingProfileId: this.options.embeddingProfileId,
			};
			const result = validateSearchResponse(
				await this.post("/knowledge/search", request, 32 * 1024, signal),
				request,
			);
			const documents = await abortable(
				this.options.registry.current(
					request.scope,
					result.candidates.map((c) => c.documentId),
					request.embeddingProfileId,
					signal,
				),
				signal,
			);
			const evidence = result.candidates.map((c) => {
				const matches = documents.filter((d) => d.entry.id === c.documentId);
				requireValue(matches.length === 1);
				const doc = matches[0];
				const entry = validatePrivateRegistration([doc.entry], request.scope)[0];
				requireValue(
					doc.active && entry.version === c.version && entry.sourceRef === c.sourceRef && entry.kind === c.kind,
				);
				requireValue(doc.contentSha256 === c.contentSha256 && sha256(entry.content) === c.contentSha256);
				validateCompleteChunkGeneration(entry, doc.chunks, c.embeddingProfileId);
				const chunks = doc.chunks.filter(
					(chunk) => chunk.chunkId === c.chunkId && chunk.embeddingProfileId === c.embeddingProfileId,
				);
				requireValue(chunks.length === 1);
				const stored = chunks[0];
				const expected = canonicalChunks(entry, c.embeddingProfileId)[stored.ordinal];
				requireValue(
					expected &&
						expected.chunkId === c.chunkId &&
						stored.text === c.text &&
						expected.text === c.text &&
						stored.chunkSha256 === c.chunkSha256 &&
						expected.chunkSha256 === c.chunkSha256,
				);
				const knowledge = {
					kind: entry.kind,
					status: entry.status,
					version: entry.version,
					sourceRef: entry.sourceRef,
					tenantScope: entry.tenantScope,
					storeScope: entry.storeScope,
				};
				requireValue(isAdmissibleKnowledgeEvidence(knowledge, request.scope, false));
				return { id: entry.id, text: entry.content, knowledge, relevance: { score: c.score, rank: c.rank } };
			});
			requireValue(!signal.aborted);
			return evidence;
		} catch {
			throw unavailable();
		}
	}
	/** Operator-only call after registry registration; caller supplies its finite job deadline. */
	async ingest(entry: KnowledgeEntry, scope: Scope, signal: AbortSignal): Promise<IngestResponse> {
		try {
			const approved = validatePrivateRegistration([entry], scope)[0];
			requireValue(approved.kind === "policy" || approved.kind === "sop" || approved.kind === "reference");
			const request: IngestRequest = {
				schemaVersion: "job-ready-v1",
				requestId: randomUUID(),
				scope: { ...scope },
				documentId: approved.id,
				version: approved.version,
				contentSha256: sha256(approved.content),
				embeddingProfileId: this.options.embeddingProfileId,
			};
			const result = await this.post("/knowledge/ingest", request, 8 * 1024, signal);
			exactObject(result, [
				"schemaVersion",
				"requestId",
				"documentId",
				"version",
				"contentSha256",
				"embeddingProfileId",
				"chunkCount",
				"outcome",
			]);
			for (const key of [
				"schemaVersion",
				"requestId",
				"documentId",
				"version",
				"contentSha256",
				"embeddingProfileId",
			] as const)
				requireValue(result[key] === request[key]);
			requireValue(
				result.chunkCount === canonicalChunks(approved, request.embeddingProfileId).length &&
					(result.outcome === "indexed" || result.outcome === "already_indexed"),
			);
			requireValue(!signal.aborted);
			return result as unknown as IngestResponse;
		} catch {
			throw unavailable();
		}
	}
}
