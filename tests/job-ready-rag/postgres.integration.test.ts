import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { PostgresRagRegistry } from "../../src/retrieval/fastapi.ts";

const url = process.env.POSTGRES_RAG_TEST_URL;
const scope = { tenantId: "rag-tenant", storeId: "rag-store" };
const fixture = {
	id: "doc",
	kind: "policy" as const,
	status: "approved" as const,
	title: "test",
	content: "Test-only content.",
	version: "1",
	updatedAt: "2026-09-06",
	sourceRef: "fixture:test",
	tags: [],
	tenantScope: scope.tenantId,
	storeScope: scope.storeId,
};
describe.skipIf(!url)("real PostgreSQL RAG registry (requires preinstalled pgvector)", () => {
	it("atomically registers immutable versions, retires old evidence, and fails closed until GAP-03 resolves", async () => {
		const schema = `rag_${randomUUID().replaceAll("-", "")}`;
		const owner = new Pool({ connectionString: url });
		await owner.query(`CREATE SCHEMA ${schema}`);
		const pool = new Pool({ connectionString: url, options: `-c search_path=${schema},public` });
		try {
			await pool.query(
				readFileSync(new URL("../../migrations/001_enterprise_identity.sql", import.meta.url), "utf8"),
			);
			await pool.query(readFileSync(new URL("../../migrations/004_job_ready_rag.sql", import.meta.url), "utf8"));
			await pool.query("INSERT INTO tenants VALUES ($1,'test',NOW())", [scope.tenantId]);
			await pool.query("INSERT INTO stores VALUES ($1,$2,'test',NOW())", [scope.storeId, scope.tenantId]);
			const registry = new PostgresRagRegistry(pool);
			const signal = new AbortController().signal;
			await Promise.all([registry.register([fixture], scope, signal), registry.register([fixture], scope, signal)]);
			expect((await pool.query("SELECT count(*)::int AS n FROM rag_documents")).rows[0].n).toBe(1);
			await expect(
				registry.register([{ ...fixture, content: "Changed under the same version" }], scope, signal),
			).rejects.toThrow();
			expect((await pool.query("SELECT content FROM rag_documents")).rows[0].content).toBe(fixture.content);
			await registry.register([{ ...fixture, version: "2", content: "Replacement fixture." }], scope, signal);
			expect((await registry.current(scope, [fixture.id], "profile", signal)).map((d) => d.entry.version)).toEqual([
				"2",
			]);
			expect(await registry.current({ ...scope, storeId: "foreign" }, [fixture.id], "profile", signal)).toEqual([]);
			await expect(pool.query("UPDATE rag_documents SET content = 'forged' WHERE version='2'")).rejects.toThrow();
			await expect(
				pool.query("UPDATE rag_documents SET content_sha256 = repeat('0',64) WHERE version='2'"),
			).rejects.toThrow();
			await expect(
				pool.query(
					"INSERT INTO rag_chunks (tenant_id,store_id,document_id,version,embedding_profile_id,chunk_id,ordinal,text,chunk_sha256,embedding,created_at) VALUES ($1,$2,'doc','2','profile',repeat('0',64),0,'x',encode(sha256(convert_to('x','UTF8')),'hex'),'[1,0]',NOW())",
					[scope.tenantId, scope.storeId],
				),
			).rejects.toMatchObject({ constraint: "gap03_profile_unresolved" });
			await pool.query("UPDATE rag_documents SET active=false,status='retired' WHERE version='2'");
			expect(await registry.current(scope, [fixture.id], "profile", signal)).toEqual([]);
			await expect(
				registry.register([{ ...fixture, version: "2", content: "Replacement fixture." }], scope, signal),
			).rejects.toThrow();
			const privileges = await pool.query(
				"SELECT has_table_privilege('job_ready_rag_indexer','rag_documents','UPDATE') AS documents,has_table_privilege('job_ready_rag_indexer','rag_chunks','INSERT') AS chunks,has_table_privilege('job_ready_rag_indexer','tickets','INSERT') AS tickets",
			);
			expect(privileges.rows[0]).toEqual({ documents: false, chunks: true, tickets: false });
		} finally {
			await pool.end();
			await owner.query(`DROP SCHEMA ${schema} CASCADE`);
			await owner.end();
		}
	});
});
