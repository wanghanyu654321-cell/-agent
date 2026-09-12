"""Real disposable PostgreSQL tests. CI's existing Node ledger supplies 001-005.

No hosted requests. Each test owns a unique synthetic tenant and removes only its
own rows. POSTGRES_RAG_TEST_URL must be the disposable owner URL, never production.
"""
import asyncio
import json
import os
import unittest
from psycopg.errors import CheckViolation, DataException
from contextlib import asynccontextmanager
from uuid import uuid4
from unittest.mock import patch

from rag_service.connection import postgres_connection
from rag_service.contracts import IngestRequest, SearchRequest
from rag_service.core import Profile, RetrievalError, RetrievalService, sha256
from rag_service.embedding import DeterministicEmbedding, DETERMINISTIC_PROFILE, HOSTED_PROFILE
from rag_service.postgres import PostgresIngestion, PostgresRepository


@unittest.skipUnless(os.environ.get("POSTGRES_RAG_TEST_URL"), "disposable PostgreSQL unavailable")
class S2PostgresTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.url = os.environ["POSTGRES_RAG_TEST_URL"]
        self.tenant = "s2-" + uuid4().hex
        self.scope = {"tenantId": self.tenant, "storeId": self.tenant + "-a"}
        self.profile = Profile(DETERMINISTIC_PROFILE, 1536, -1.0)
        self.repo = PostgresRepository(self.indexer, self.profile)
        self.engine = RetrievalService(self.repo, DeterministicEmbedding(), self.profile)
        async with postgres_connection(self.url) as db:
            await db.execute("INSERT INTO tenants VALUES (%s,'Synthetic S2',now())", (self.tenant,))
            for store in (self.scope["storeId"], self.tenant + "-b"):
                await db.execute("INSERT INTO stores VALUES (%s,%s,'Synthetic S2',now())", (store, self.tenant))
        self.addAsyncCleanup(self.cleanup)

    @asynccontextmanager
    async def indexer(self):
        async with postgres_connection(self.url) as db:
            await db.execute("SET ROLE job_ready_rag_indexer")
            yield db

    async def cleanup(self):
        async with postgres_connection(self.url) as db:
            for table in ("rag_chunks", "rag_documents", "stores"):
                await db.execute(f"DELETE FROM {table} WHERE tenant_id=%s", (self.tenant,))
            await db.execute("DELETE FROM tenants WHERE id=%s", (self.tenant,))

    async def register(self, doc="doc", content="Public synthetic S2 fixture", version="1", store=None,
                       status="approved", active=True):
        scope = {**self.scope, "storeId": store or self.scope["storeId"]}
        async with postgres_connection(self.url) as db:
            await db.execute("""INSERT INTO rag_documents
                (tenant_id,store_id,document_id,version,kind,title,content,content_sha256,source_ref,updated_date,tags,status,active)
                VALUES (%s,%s,%s,%s,'reference','Synthetic S2',%s,%s,'test://s2','2026-09-12','[]',%s,%s)""",
                (self.tenant, scope["storeId"], doc, version, content, sha256(content), status, active))
        return IngestRequest(schemaVersion="job-ready-v1", requestId="s2", scope=scope, documentId=doc,
                             version=version, contentSha256=sha256(content), embeddingProfileId=DETERMINISTIC_PROFILE)

    def search(self, **changes):
        return SearchRequest(**{ "schemaVersion": "job-ready-v1", "requestId": "s2", "scope": self.scope,
            "query": "Public synthetic S2 fixture", "topK": 3, "embeddingProfileId": DETERMINISTIC_PROFILE, **changes})

    async def count_chunks(self):
        async with postgres_connection(self.url) as db:
            cursor = await db.execute("SELECT count(*) AS n FROM rag_chunks WHERE tenant_id=%s", (self.tenant,))
            return (await cursor.fetchone())["n"]

    async def test_readiness_privileges_dimensions_and_both_profile_constraints(self):
        self.assertTrue(await self.repo.ready())
        self.assertFalse(await PostgresRepository(lambda: postgres_connection(self.url), self.profile).ready())
        request = await self.register()
        await self.engine.ingest(request)
        async with postgres_connection(self.url) as db:
            for vector, profile, error in (([1.0], HOSTED_PROFILE, DataException),
                                            ([1.0] * 1536, "unapproved-profile", CheckViolation)):
                with self.assertRaises(error):
                    await db.execute("""INSERT INTO rag_chunks SELECT tenant_id,store_id,document_id,version,%s,
                        chunk_id,ordinal,text,chunk_sha256,%s::vector,created_at FROM rag_chunks
                        WHERE tenant_id=%s AND embedding_profile_id=%s""",
                        (profile, json.dumps(vector), self.tenant, DETERMINISTIC_PROFILE))
            await db.execute("""INSERT INTO rag_chunks SELECT tenant_id,store_id,document_id,version,%s,
                chunk_id,ordinal,text,chunk_sha256,embedding,created_at FROM rag_chunks
                WHERE tenant_id=%s AND embedding_profile_id=%s""", (HOSTED_PROFILE, self.tenant, DETERMINISTIC_PROFILE))
        self.assertEqual(await self.count_chunks(), 2)
        self.assertEqual(len((await self.engine.search(self.search())).candidates), 1)

    async def test_real_ingest_concurrency_conflict_and_scope_status_version_isolation(self):
        request = await self.register()
        results = await asyncio.gather(self.engine.ingest(request), self.engine.ingest(request))
        self.assertEqual(sorted(r.outcome for r in results), ["already_indexed", "indexed"])
        await self.engine.ingest(await self.register(store=self.tenant + "-b"))
        await self.register("retired", status="retired", active=False)
        await self.register(version="old", status="retired", active=False)
        result = await self.engine.search(self.search())
        self.assertEqual([(c.documentId, c.version) for c in result.candidates], [("doc", "1")])
        self.assertEqual((await self.engine.search(self.search(scope={"tenantId": "foreign", "storeId": "foreign"}))).candidates, [])
        for change in ({"contentSha256": "0" * 64}, {"version": "old"}, {"documentId": "retired"},
                       {"embeddingProfileId": HOSTED_PROFILE}):
            with self.assertRaises(RetrievalError):
                await self.engine.ingest(request.model_copy(update=change))
        self.assertEqual(await self.count_chunks(), 2)

    async def test_actual_insert_rolls_back_on_failure_and_cancellation(self):
        request = await self.register(content="x" * 2001)
        original = PostgresIngestion.publish
        async def fail_after_insert(transaction, chunks):
            await original(transaction, chunks[:1])
            raise RuntimeError("injected failure after real INSERT")
        with patch.object(PostgresIngestion, "publish", fail_after_insert):
            with self.assertRaises(RuntimeError):
                await self.engine.ingest(request)
        self.assertEqual(await self.count_chunks(), 0)
        inserted = asyncio.Event()
        async def cancel_after_insert(transaction, chunks):
            await original(transaction, chunks[:1])
            inserted.set()
            await asyncio.Event().wait()
        with patch.object(PostgresIngestion, "publish", cancel_after_insert):
            task = asyncio.create_task(self.engine.ingest(request))
            try:
                await asyncio.wait_for(inserted.wait(), 5)
            finally:
                task.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await task
        self.assertEqual(await self.count_chunks(), 0)
        self.assertEqual((await self.engine.ingest(request)).chunkCount, 2)
