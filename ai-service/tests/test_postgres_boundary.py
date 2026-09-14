import unittest
from contextlib import asynccontextmanager
from dataclasses import asdict
from rag_service.postgres import PostgresRepository
from rag_service.core import RetrievalService
from test_core import document, ingest_request, search_request, PROFILE, FixtureEmbedding


class RecordingConnection:
    """DB-wire substitute; records emitted SQL/parameters, not PostgreSQL evidence."""
    def __init__(self):
        self.calls, self.committed, self.rolled_back = [], False, False
        self.rows, self.is_ready = [], False
    @asynccontextmanager
    async def transaction(self):
        try:
            yield
            self.committed = True
        except BaseException:
            self.rolled_back = True
            raise
    async def execute(self, sql, params=()):
        self.calls.append((sql, params))
        connection = self
        class Cursor:
            async def fetchone(self):
                return asdict(document()) if "WHERE tenant_id = %s" in sql else {"ready": connection.is_ready}
            async def fetchall(self):
                return connection.rows
        return Cursor()


class PostgresWireTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.connection = RecordingConnection()
        @asynccontextmanager
        async def factory():
            yield self.connection
        self.repo = PostgresRepository(factory, PROFILE)
    async def test_gap_guard_prevents_healthy_state(self):
        self.assertFalse(await self.repo.ready())
        sql, params = self.connection.calls[-1]
        self.assertIn("gap03_profile_unresolved", sql)
        self.assertIn("rag_chunks_s2_profile", sql)
        self.assertIn("convalidated", sql)
        self.assertEqual(params, ("vector(2)",))
    async def test_ingest_emits_locks_scoped_read_and_atomic_insert(self):
        self.connection.is_ready = True
        result = await RetrievalService(self.repo, FixtureEmbedding(), PROFILE).ingest(ingest_request())
        self.assertEqual(result.outcome, "indexed")
        self.assertTrue(self.connection.committed)
        selects = [(sql, p) for sql, p in self.connection.calls if "FROM public.rag_documents" in sql and "WHERE tenant_id = %s" in sql]
        self.assertEqual(selects[0][1], ("tenant", "store", "d1", "v1"))
        self.assertTrue(any("pg_advisory_xact_lock" in sql for sql, _ in self.connection.calls))
        locks = [p[0] for sql, p in self.connection.calls if "pg_advisory_xact_lock" in sql]
        self.assertEqual(locks, ['["tenant","store","d1"]', '["tenant","store","d1","v1","fixture-v1"]'])
        inserted = [(sql, p) for sql, p in self.connection.calls if "INSERT INTO" in sql]
        self.assertEqual(len(inserted), 1)
        self.assertEqual(inserted[0][1][:5], ("tenant", "store", "d1", "v1", "fixture-v1"))
        self.assertFalse(any(sql.lstrip().startswith("UPDATE ") for sql, _ in self.connection.calls))
    async def test_search_binds_scope_profile_and_filters_before_ranking(self):
        self.assertEqual(await self.repo.search_rows(search_request()), [])
        sql, params = self.connection.calls[-1]
        self.assertEqual(params[:3], ("tenant", "store", "fixture-v1"))
        self.assertIn("d.status = 'approved'", sql)
        self.assertIn("d.active", sql)
        self.assertIn("d.version = c.version", sql)
        self.assertIn("'policy', 'sop', 'reference'", sql)
    async def test_query_overflow_is_failure_not_truncated_success(self):
        self.connection.rows = [{}] * 1025
        with self.assertRaises(Exception) as caught:
            await self.repo.search_rows(search_request())
        self.assertEqual(str(caught.exception), "retrieval_unavailable")
