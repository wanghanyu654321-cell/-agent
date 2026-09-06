import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import {
	canonicalChunks,
	FastApiRetrievalService,
	PostgresRagRegistry,
	type RagRegistry,
	type RegisteredDocument,
	validatePrivateRegistration,
	validateSearchResponse,
} from "../../src/retrieval/fastapi.ts";

const scope = { tenantId: "tenant-a", storeId: "store-a" };
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const entry = {
	id: "doc-a",
	kind: "policy" as const,
	status: "approved" as const,
	title: "fixture",
	content: "Fixture only: A or B.",
	version: "v1",
	updatedAt: "2026-09-06",
	sourceRef: "fixture:official-test",
	tags: [],
	tenantScope: scope.tenantId,
	storeScope: scope.storeId,
};
const profile = "test-profile";
const chunkHash = hash(entry.content);
const chunkId = hash(JSON.stringify([scope.tenantId, scope.storeId, entry.id, entry.version, profile, 0, chunkHash]));
const candidate = {
	chunkId,
	documentId: entry.id,
	version: entry.version,
	sourceRef: entry.sourceRef,
	kind: entry.kind,
	scope,
	status: entry.status,
	contentSha256: hash(entry.content),
	chunkSha256: chunkHash,
	text: entry.content,
	score: 0.8,
	rank: 1,
	embeddingProfileId: profile,
};
const document: RegisteredDocument = {
	entry,
	active: true,
	contentSha256: hash(entry.content),
	chunks: [{ chunkId, ordinal: 0, text: entry.content, chunkSha256: chunkHash, embeddingProfileId: profile }],
};
function setup(candidates: unknown[] = [candidate], docs = [document]) {
	const registry: RagRegistry = { current: vi.fn(async () => structuredClone(docs)) };
	const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
		const request = JSON.parse(String(init?.body));
		return new Response(JSON.stringify({ schemaVersion: "job-ready-v1", requestId: request.requestId, candidates }), {
			headers: { "content-type": "application/json" },
		});
	});
	const adapter = new FastApiRetrievalService({
		endpoint: "http://retrieval.internal",
		serviceCredential: "test-service-only",
		embeddingProfileId: profile,
		registry,
		fetch: fetcher,
	});
	return { adapter, registry, fetcher };
}
describe("Core B Node admission boundary", () => {
	it.each(["search", "ingest"] as const)("rejects %s cancellation at completed-body handoff", async (operation) => {
		const { adapter, fetcher } = setup([]);
		const controller = new AbortController();
		fetcher.mockImplementationOnce(async (_url, init) => {
			const { scope: _scope, ...request } = JSON.parse(String(init?.body));
			const body =
				operation === "search"
					? { schemaVersion: request.schemaVersion, requestId: request.requestId, candidates: [] }
					: { ...request, chunkCount: 1, outcome: "indexed" };
			const response = new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
			const getReader = response.body!.getReader.bind(response.body);
			response.body!.getReader = (() => {
				const reader = getReader();
				const read = reader.read.bind(reader);
				reader.read = async () => {
					const result = await read();
					if (result.done) {
						let remaining = 3;
						const abortLater = () => {
							if (remaining-- <= 0) controller.abort();
							else queueMicrotask(abortLater);
						};
						queueMicrotask(abortLater);
					}
					return result;
				};
				return reader;
			}) as NonNullable<typeof response.body>["getReader"];
			return response;
		});
		const pending =
			operation === "search"
				? adapter.search("nothing", controller.signal, scope)
				: adapter.ingest(entry, scope, controller.signal);
		await expect(pending).rejects.toThrow("retrieval_unavailable");
		expect(controller.signal.aborted).toBe(true);
		expect(fetcher).toHaveBeenCalledTimes(1);
	});
	it("does not turn a Node registry outage into successful no-answer", async () => {
		const { adapter, registry } = setup([]);
		registry.current = async () => {
			throw new Error("private DB details");
		};
		await expect(adapter.search("nothing", new AbortController().signal, scope)).rejects.toThrow(
			"retrieval_unavailable",
		);
	});
	it("validates the kind as a string without coercion even before registry reconciliation", () => {
		const request = {
			schemaVersion: "job-ready-v1" as const,
			requestId: "test",
			scope,
			query: "test",
			topK: 3 as const,
			embeddingProfileId: profile,
		};
		expect(() =>
			validateSearchResponse(
				{ schemaVersion: "job-ready-v1", requestId: "test", candidates: [{ ...candidate, kind: ["policy"] }] },
				request,
			),
		).toThrow();
	});
	it("returns only a bounded configuration error for an invalid endpoint", () => {
		expect(
			() =>
				new FastApiRetrievalService({
					endpoint: "invalid endpoint",
					serviceCredential: "test-only",
					embeddingProfileId: profile,
					registry: { current: async () => [] },
				}),
		).toThrow("retrieval_unavailable");
	});
	it("rejects a non-string ingest outcome instead of coercing it into a success", async () => {
		const { adapter, fetcher } = setup();
		fetcher.mockImplementationOnce(async (_url, init) => {
			const { scope: _scope, ...request } = JSON.parse(String(init?.body));
			return new Response(JSON.stringify({ ...request, chunkCount: 1, outcome: ["indexed"] }), {
				headers: { "content-type": "application/json" },
			});
		});
		await expect(adapter.ingest(entry, scope, new AbortController().signal)).rejects.toThrow();
	});
	it("cancels an unsuccessful upstream response body without exposing its details", async () => {
		const { adapter, fetcher } = setup();
		const cancel = vi.fn();
		fetcher.mockImplementationOnce(async () => new Response(new ReadableStream({ cancel }), { status: 503 }));
		await expect(adapter.search("x", new AbortController().signal, scope)).rejects.toThrow("retrieval_unavailable");
		expect(cancel).toHaveBeenCalledTimes(1);
	});
	it("preserves an exact whitespace chunk but rehydrates only the bounded canonical document", async () => {
		const content = `${" ".repeat(2000)}fixture continuation`;
		const fullEntry = { ...entry, content };
		const chunks = canonicalChunks(fullEntry, profile);
		const first = chunks[0];
		const c = { ...candidate, ...first, contentSha256: hash(content) };
		const { ordinal: _ordinal, ...wireCandidate } = c;
		const docs = [{ entry: fullEntry, active: true, contentSha256: hash(content), chunks }];
		const result = await setup([wireCandidate], docs).adapter.search("x", new AbortController().signal, scope);
		expect(result[0].text).toBe(content);
	});
	it("rehydrates only current approved canonical evidence after an authenticated scoped request", async () => {
		const { adapter, fetcher } = setup();
		expect(await adapter.search("fixture", new AbortController().signal, scope)).toEqual([
			{
				id: entry.id,
				text: entry.content,
				knowledge: {
					kind: "policy",
					status: "approved",
					version: "v1",
					sourceRef: entry.sourceRef,
					tenantScope: "tenant-a",
					storeScope: "store-a",
				},
				relevance: { score: 0.8, rank: 1 },
			},
		]);
		const init = fetcher.mock.calls[0][1]!;
		expect(new Headers(init.headers).get("authorization")).toBe("Bearer test-service-only");
		expect(JSON.parse(String(init.body))).toMatchObject({
			schemaVersion: "job-ready-v1",
			scope,
			query: "fixture",
			topK: 3,
			embeddingProfileId: profile,
		});
		expect(init.redirect).toBe("error");
	});
	it("distinguishes successful zero matches from service failure without fallback or retry", async () => {
		expect(await setup([]).adapter.search("nothing", new AbortController().signal, scope)).toEqual([]);
		const { adapter, fetcher } = setup();
		fetcher.mockImplementationOnce(async () => new Response("private upstream details", { status: 503 }));
		await expect(adapter.search("x", new AbortController().signal, scope)).rejects.toThrow("retrieval_unavailable");
		expect(fetcher).toHaveBeenCalledTimes(1);
	});
	it.each([
		{ scope: { ...scope, storeId: "other" } },
		{ status: "synthetic_test_only" },
		{ status: "retired" },
		{ version: "old" },
		{ sourceRef: "fabricated" },
		{ kind: "faq" },
		{ embeddingProfileId: "other" },
		{ contentSha256: "0".repeat(64) },
		{ chunkSha256: "0".repeat(64) },
		{ chunkId: "0".repeat(64) },
		{ text: "invented" },
		{ rank: 2 },
		{ score: 2 },
		{ text: "x".repeat(2001) },
		{ safety: {} },
	])("rejects fabricated/malformed candidate %j", async (patch) => {
		await expect(
			setup([{ ...candidate, ...patch }]).adapter.search("x", new AbortController().signal, scope),
		).rejects.toThrow("retrieval_unavailable");
	});
	it.each(["unapproved", "retired", "synthetic_test_only"])(
		"does not trust Python approval when Node registry is %s",
		async (status) => {
			const doc = structuredClone(document);
			doc.entry.status = status as typeof doc.entry.status;
			await expect(
				setup([candidate], [doc]).adapter.search("x", new AbortController().signal, scope),
			).rejects.toThrow();
		},
	);
	it("rejects an inactive or missing current registry record", async () => {
		for (const docs of [[], [{ ...document, active: false }]]) {
			await expect(
				setup([candidate], docs).adapter.search("x", new AbortController().signal, scope),
			).rejects.toThrow();
		}
	});
	it("rejects duplicate documents rather than selecting Top1", async () => {
		await expect(
			setup([candidate, { ...candidate, rank: 2 }]).adapter.search("x", new AbortController().signal, scope),
		).rejects.toThrow();
	});
	it("requires trusted explicit context before performing HTTP", async () => {
		const { adapter, fetcher } = setup();
		await expect(adapter.search("x", new AbortController().signal)).rejects.toThrow();
		expect(fetcher).not.toHaveBeenCalled();
	});
	it("discards late transport results even when a broken transport ignores cancellation", async () => {
		const { adapter, fetcher } = setup();
		const controller = new AbortController();
		let resolve!: (response: Response) => void;
		fetcher.mockImplementationOnce(
			() =>
				new Promise<Response>((r) => {
					resolve = r;
				}),
		);
		const pending = adapter.search("x", controller.signal, scope);
		controller.abort();
		await expect(pending).rejects.toThrow("retrieval_unavailable");
		resolve(new Response("{}"));
		expect(fetcher).toHaveBeenCalledTimes(1);
	});
	it("cancels while Node registry verification is pending", async () => {
		const { adapter, registry } = setup();
		const controller = new AbortController();
		registry.current = async () => {
			controller.abort();
			return [document];
		};
		await expect(adapter.search("x", controller.signal, scope)).rejects.toThrow();
	});
	it("rejects oversized valid JSON and extra envelope fields independently of JSON syntax", async () => {
		for (const oversized of [true, false]) {
			const { adapter, fetcher } = setup();
			fetcher.mockImplementationOnce(async (_url, init) => {
				const request = JSON.parse(String(init?.body));
				const body = JSON.stringify({
					schemaVersion: "job-ready-v1",
					requestId: request.requestId,
					candidates: [],
					...(!oversized ? { answer: "not allowed" } : {}),
				});
				return new Response((oversized ? " ".repeat(256 * 1024) : "") + body, {
					headers: { "content-type": "application/json" },
				});
			});
			await expect(adapter.search("x", new AbortController().signal, scope)).rejects.toThrow();
		}
	});
});
describe("Core B canonical registration and chunking", () => {
	it("treats the same PostgreSQL DATE version as idempotent without process-timezone conversion", async () => {
		const statements: string[] = [];
		const client = {
			release: vi.fn(),
			query: async (sql: string) => {
				statements.push(sql);
				return {
					rows:
						sql.startsWith("SELECT") && sql.includes("FROM rag_documents")
							? [
									{
										active: true,
										status: entry.status,
										content: entry.content,
										content_sha256: hash(entry.content),
										source_ref: entry.sourceRef,
										kind: entry.kind,
										title: entry.title,
										updated_date: new Date("2026-09-05T16:00:00Z"),
										date_text: sql.includes("to_char") ? "2026-09-06" : undefined,
										tags: [],
									},
								]
							: [],
				};
			},
		};
		const registry = new PostgresRagRegistry({ connect: async () => client } as unknown as Pool);
		await expect(registry.register([entry], scope, new AbortController().signal)).resolves.toBeUndefined();
		expect(statements).toContain("COMMIT");
		expect(statements.some((sql) => sql.startsWith("INSERT") || sql.startsWith("UPDATE"))).toBe(false);
	});
	it("matches the shared Node/Pydantic unescaped Unicode wire fixture without normalization", () => {
		const fixture = JSON.parse(readFileSync(new URL("./contract-fixture.json", import.meta.url), "utf8"));
		const [chunk] = canonicalChunks(fixture.entry, fixture.ingestRequest.embeddingProfileId);
		expect(chunk.chunkId).toBe("cf732ae8ba044c8b9f1500d1d1faab14dd800dd8749c0ea3cc906f5747e54ea8");
		expect(chunk.chunkSha256).toBe("75b7c714e5cc17615b721f62eab8e8a88e3a53ea0f2fbb9422b89592fb86c25b");
		expect(validateSearchResponse(fixture.searchResponse, fixture.searchRequest)).toEqual(fixture.searchResponse);
	});
	it("rejects invalid private input before acquiring a PostgreSQL connection", async () => {
		const connect = vi.fn();
		const registry = new PostgresRagRegistry({ connect } as unknown as Pool);
		await expect(
			registry.register([{ ...entry, content: "x".repeat(16001) }], scope, new AbortController().signal),
		).rejects.toThrow();
		expect(connect).not.toHaveBeenCalled();
	});
	it("accepts 16000 code points including astral characters without truncating", () => {
		const input = { ...entry, content: "😀".repeat(16000) };
		expect(validatePrivateRegistration([input], scope)[0].content).toBe(input.content);
		const chunks = canonicalChunks(input, profile);
		expect(chunks).toHaveLength(8);
		expect(chunks.map((c) => c.text).join("")).toBe(input.content);
		expect(chunks.map((c) => [...c.text].length)).toEqual(Array(8).fill(2000));
		expect(chunks.map((c) => c.ordinal)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
	});
	it("rejects oversized canonical content, malformed Unicode and mixed scope before registration", () => {
		for (const patch of [
			{ content: "a".repeat(16001) },
			{ content: "\ud800" },
			{ tenantScope: "other" },
			{ status: "synthetic_test_only" },
			{ storeScope: undefined },
		]) {
			expect(() => validatePrivateRegistration([{ ...entry, ...patch } as typeof entry], scope)).toThrow();
		}
	});
	it("uses the exact compact unescaped Unicode tuple for chunk identity", () => {
		expect(canonicalChunks(entry, profile)[0]).toEqual({
			chunkId,
			ordinal: 0,
			text: entry.content,
			chunkSha256: chunkHash,
			embeddingProfileId: profile,
		});
	});
});
