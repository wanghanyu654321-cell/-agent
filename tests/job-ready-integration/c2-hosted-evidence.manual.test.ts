import { type ChildProcess, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { applyJobReadyMigrations } from "../../src/enterprise/postgres.ts";
import { FastApiRetrievalService, PostgresRagRegistry } from "../../src/retrieval/fastapi.ts";

const dbUrl = process.env.POSTGRES_RAG_TEST_URL;
const apiKey = process.env.OPENAI_API_KEY;
const hostedProfile = "openai-text-embedding-3-small-1536-v1";
const requestedModel = "text-embedding-3-small";
const sourceCommit = process.env.C2_SOURCE_COMMIT;
const sourceTree = process.env.C2_SOURCE_TREE;
const evidencePath = process.env.C2_EVIDENCE_PATH ?? join(tmpdir(), "s2-c2-hosted-evidence.json");
const tracePath = process.env.C2_TRACE_PATH ?? join(tmpdir(), "s2-c2-openai-trace.jsonl");

if (!dbUrl) throw new Error("POSTGRES_RAG_TEST_URL required for authorized C2 evidence run");
if (!apiKey) throw new Error("OPENAI_API_KEY required for authorized C2 evidence run");
if (!sourceCommit || !sourceTree) throw new Error("C2 source provenance required");

describe("S2 C2 one-time hosted embedding evidence", () => {
	it("executes hosted OpenAI embedding through PostgreSQL and Node canonical reconciliation", async () => {
		const database = `s2c2_${randomUUID().replaceAll("-", "")}`;
		const owner = new Pool({ connectionString: dbUrl });
		const connection = new URL(dbUrl);
		connection.pathname = `/${database}`;
		connection.search = "";
		let child: ChildProcess | undefined;
		let created = false;
		let pool: Pool | undefined;
		try {
			await owner.query(`CREATE DATABASE ${database}`);
			created = true;
			pool = new Pool({ connectionString: connection.toString() });
			await applyJobReadyMigrations(pool);
			expect(
				(await pool.query("SELECT id FROM enterprise_schema_migrations ORDER BY id")).rows.map((r) => r.id),
			).toEqual([
				"001_enterprise_identity",
				"002_support_business_persistence",
				"003_job_ready_storeops",
				"004_job_ready_rag",
				"005_job_ready_rag_profiles",
			]);
			expect(
				(
					await pool.query(
						"SELECT format_type(atttypid,atttypmod) AS type FROM pg_attribute WHERE attrelid='rag_chunks'::regclass AND attname='embedding'",
					)
				).rows[0].type,
			).toBe("vector(1536)");

			const tenantId = "s2-c2-public";
			const storeId = "s2-c2-public-store";
			await pool.query("INSERT INTO tenants VALUES ($1,'Synthetic C2',now())", [tenantId]);
			await pool.query("INSERT INTO stores VALUES ($1,$2,'Synthetic C2',now())", [storeId, tenantId]);
			const scope = { tenantId, storeId };
			const entry = {
				id: "c2-public-fixture",
				kind: "reference" as const,
				status: "approved" as const,
				title: "Public synthetic C2 fixture",
				content:
					"Public synthetic C2 evidence fixture. The marker phrase is cobalt orchid seven. This text contains no customer or store data.",
				version: "1",
				sourceRef: "test://s2-c2-public-synthetic",
				updatedAt: "2026-09-12",
				tags: ["public-synthetic", "c2-evidence"],
				tenantScope: tenantId,
				storeScope: storeId,
			};
			const corpusSha256 = createHash("sha256").update(entry.content, "utf8").digest("hex");
			const registry = new PostgresRagRegistry(pool);
			await registry.register([entry], scope, AbortSignal.timeout(2000));

			connection.search = `?options=${encodeURIComponent("-c role=job_ready_rag_indexer")}`;
			expect(connection.toString()).toContain("options=-c%20role%3Djob_ready_rag_indexer");
			child = spawn(process.env.S2_PYTHON || "python", ["-B", "tests/s2_c2_http_server.py"], {
				cwd: fileURLToPath(new URL("../../ai-service", import.meta.url)),
				env: {
					PATH: process.env.PATH,
					SYSTEMROOT: process.env.SYSTEMROOT,
					RAG_DATABASE_URL: connection.toString(),
					RAG_SERVICE_CREDENTIAL: "s2-c2-disposable",
					RAG_CORPUS_CLASSIFICATION: "public-synthetic",
					RAG_EMBEDDING_MODE: "openai",
					RAG_EMBEDDING_PROFILE: hostedProfile,
					RAG_INGEST_TIMEOUT_SECONDS: "10",
					OPENAI_API_KEY: apiKey,
					C2_TRACE_PATH: tracePath,
				},
				stdio: ["ignore", "pipe", "pipe"],
				windowsHide: true,
			});
			const exited = once(child, "exit");
			const output = await Promise.race([
				once(child.stdout!, "data", { signal: AbortSignal.timeout(10000) }),
				exited.then(() => {
					throw new Error("C2 Python evidence process exited before startup");
				}),
			]);
			const endpoint = `http://127.0.0.1:${JSON.parse(String(output[0])).port}`;
			let ready = false;
			for (let attempt = 0; attempt < 40 && !ready; attempt++) {
				try {
					ready = (
						await fetch(`${endpoint}/health`, {
							headers: { authorization: "Bearer s2-c2-disposable" },
							signal: AbortSignal.timeout(500),
						})
					).ok;
				} catch {
					/* process still starting */
				}
				if (!ready) await new Promise((resolve) => setTimeout(resolve, 50));
			}
			expect(ready).toBe(true);

			const retrieval = new FastApiRetrievalService({
				endpoint,
				registry,
				serviceCredential: "s2-c2-disposable",
				embeddingProfileId: hostedProfile,
			});
			const ingestStarted = performance.now();
			const ingest = await retrieval.ingest(entry, scope, AbortSignal.timeout(10000));
			const ingestLatencyMs = performance.now() - ingestStarted;
			expect(ingest.outcome).toBe("indexed");
			expect(ingest.chunkCount).toBe(1);

			const searchCaseId = "c2-public-marker-query-v1";
			const query = "What marker phrase is recorded in the public synthetic C2 evidence fixture?";
			const searchStarted = performance.now();
			const evidence = await retrieval.search(query, AbortSignal.timeout(2000), scope);
			const searchLatencyMs = performance.now() - searchStarted;
			expect(evidence).toHaveLength(1);
			expect(evidence[0]).toMatchObject({
				id: entry.id,
				text: entry.content,
				knowledge: {
					version: "1",
					sourceRef: entry.sourceRef,
					tenantScope: tenantId,
					storeScope: storeId,
				},
				relevance: { rank: 1 },
			});

			expect(existsSync(tracePath)).toBe(true);
			const trace = readFileSync(tracePath, "utf8")
				.trim()
				.split("\n")
				.filter(Boolean)
				.map((line) => JSON.parse(line));
			expect(trace).toHaveLength(2);
			for (const event of trace) {
				expect(event.returnedModelId).toBe(requestedModel);
				expect(event.dimensions).toBe(1536);
			}

			const packet = {
				schemaVersion: "s2-c2-hosted-evidence-v1",
				executedAt: new Date().toISOString(),
				source: {
					commit: sourceCommit,
					tree: sourceTree,
					executionCommit: process.env.GITHUB_SHA ?? null,
				},
				profileId: hostedProfile,
				requestedModelId: requestedModel,
				returnedModelIds: [...new Set(trace.map((event) => event.returnedModelId))],
				explicitDimensions: 1536,
				corpus: {
					id: "s2-c2-public-synthetic-v1",
					sha256: corpusSha256,
					classification: "public-synthetic",
					privateCustomerOrStoreDataIncluded: false,
				},
				embeddingRequests: trace.length,
				embeddingRequestMetadata: trace,
				tokenUsage: null,
				costUsd: null,
				costNote: "Production adapter does not expose provider usage metadata; no cost is inferred.",
				ingest: {
					outcome: ingest.outcome,
					chunkCount: ingest.chunkCount,
					latencyMs: Number(ingestLatencyMs.toFixed(3)),
				},
				search: {
					caseId: searchCaseId,
					latencyIncludingQueryEmbeddingMs: Number(searchLatencyMs.toFixed(3)),
					deadlineMs: 2000,
					results: evidence.map((item) => ({
						id: item.id,
						version: item.knowledge?.version,
						sourceRef: item.knowledge?.sourceRef,
						score: item.relevance?.score,
						rank: item.relevance?.rank,
					})),
				},
				nodeCanonicalReconciliation: "PASS",
				providerAutomaticRetries: 0,
				providerTimeoutSeconds: 2,
				failures: [],
			};
			writeFileSync(evidencePath, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
			console.log(`C2_EVIDENCE_PATH=${evidencePath}`);
			console.log(`C2_CORPUS_SHA256=${corpusSha256}`);
			console.log(`C2_EMBEDDING_REQUESTS=${trace.length}`);
			console.log(`C2_NODE_CANONICAL_RECONCILIATION=PASS`);
		} finally {
			if (child && child.exitCode === null && child.signalCode === null) {
				const stopped = once(child, "exit", { signal: AbortSignal.timeout(5000) });
				child.kill();
				await stopped;
			}
			await pool?.end();
			if (created) await owner.query(`DROP DATABASE ${database}`);
			await owner.end();
		}
	}, 60000);
});
