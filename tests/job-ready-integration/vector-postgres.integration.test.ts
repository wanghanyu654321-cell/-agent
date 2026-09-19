import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { applyJobReadyMigrations } from "../../src/enterprise/postgres.ts";
import { FastApiRetrievalService, PostgresRagRegistry } from "../../src/retrieval/fastapi.ts";

const url = process.env.POSTGRES_RAG_TEST_URL;
describe.skipIf(!url)("S2 fresh PostgreSQL + deterministic Python HTTP + Node reconciliation", () => {
	it("migrates 001-005, indexes and reconciles actual scoped evidence without a hosted API", async () => {
		const database = `s2_${randomUUID().replaceAll("-", "")}`;
		const owner = new Pool({ connectionString: url });
		const connection = new URL(url!);
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
			await applyJobReadyMigrations(pool);
			expect(
				(await pool.query("SELECT id FROM enterprise_schema_migrations ORDER BY id")).rows.map((r) => r.id),
			).toEqual([
				"001_enterprise_identity",
				"002_support_business_persistence",
				"003_job_ready_storeops",
				"004_job_ready_rag",
				"005_job_ready_rag_profiles",
				"006_wecom_customer_identity",
			]);
			expect(
				(
					await pool.query(
						"SELECT format_type(atttypid,atttypmod) AS type FROM pg_attribute WHERE attrelid='rag_chunks'::regclass AND attname='embedding'",
					)
				).rows[0].type,
			).toBe("vector(1536)");
			await pool.query("INSERT INTO tenants VALUES ('s2','Synthetic S2',now())");
			await pool.query("INSERT INTO stores VALUES ('s2-store','s2','Synthetic S2',now())");
			const scope = { tenantId: "s2", storeId: "s2-store" };
			const entry = {
				id: "fixture",
				kind: "reference" as const,
				status: "approved" as const,
				title: "Synthetic S2",
				content: "Public synthetic fixture 中文😀",
				version: "1",
				sourceRef: "test://s2",
				updatedAt: "2026-09-12",
				tags: [],
				tenantScope: "s2",
				storeScope: "s2-store",
			};
			const registry = new PostgresRagRegistry(pool);
			await registry.register([entry], scope, AbortSignal.timeout(2000));
			connection.search = `?options=${encodeURIComponent("-c role=job_ready_rag_indexer")}`;
			expect(connection.toString()).toContain("options=-c%20role%3Djob_ready_rag_indexer");
			expect(connection.toString()).not.toContain("options=-c+role");
			child = spawn(process.env.S2_PYTHON || "python", ["-B", "tests/s2_http_server.py"], {
				cwd: fileURLToPath(new URL("../../ai-service", import.meta.url)),
				env: {
					PATH: process.env.PATH,
					SYSTEMROOT: process.env.SYSTEMROOT,
					RAG_DATABASE_URL: connection.toString(),
					RAG_SERVICE_CREDENTIAL: "s2-disposable",
					RAG_CORPUS_CLASSIFICATION: "public-synthetic",
					RAG_EMBEDDING_MODE: "deterministic",
					RAG_EMBEDDING_PROFILE: "deterministic-test-1536-v1",
					RAG_INGEST_TIMEOUT_SECONDS: "10",
				},
				stdio: ["ignore", "pipe", "ignore"],
				windowsHide: true,
			});
			const exited = once(child, "exit");
			const output = await Promise.race([
				once(child.stdout!, "data", { signal: AbortSignal.timeout(10000) }),
				exited.then(() => {
					throw new Error("S2 Python test process exited before startup");
				}),
			]);
			const endpoint = `http://127.0.0.1:${JSON.parse(String(output[0])).port}`;
			let ready = false;
			for (let attempt = 0; attempt < 40 && !ready; attempt++) {
				try {
					ready = (
						await fetch(`${endpoint}/health`, {
							headers: { authorization: "Bearer s2-disposable" },
							signal: AbortSignal.timeout(500),
						})
					).ok;
				} catch {
					/* server is still starting */
				}
				if (!ready) await new Promise((resolve) => setTimeout(resolve, 50));
			}
			expect(ready).toBe(true);
			const retrieval = new FastApiRetrievalService({
				endpoint,
				registry,
				serviceCredential: "s2-disposable",
				embeddingProfileId: "deterministic-test-1536-v1",
			});
			expect((await retrieval.ingest(entry, scope, AbortSignal.timeout(10000))).outcome).toBe("indexed");
			expect((await retrieval.ingest(entry, scope, AbortSignal.timeout(10000))).outcome).toBe("already_indexed");
			expect(await retrieval.search(entry.content, AbortSignal.timeout(2000), scope)).toMatchObject([
				{
					id: entry.id,
					text: entry.content,
					knowledge: { version: "1", tenantScope: "s2", storeScope: "s2-store" },
				},
			]);
			expect(
				await retrieval.search(entry.content, AbortSignal.timeout(2000), {
					tenantId: "foreign",
					storeId: "foreign",
				}),
			).toEqual([]);
			await registry.register([{ ...entry, version: "2" }], scope, AbortSignal.timeout(2000));
			expect(await retrieval.search(entry.content, AbortSignal.timeout(2000), scope)).toEqual([]);
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
	}, 40000);
});
