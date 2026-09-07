"""Disposable PostgreSQL proof, never a real embedding/profile approval."""
import os
import unittest
from rag_service.connection import postgres_connection
from rag_service.core import Profile
from rag_service.postgres import PostgresRepository


@unittest.skipUnless(os.environ.get("POSTGRES_RAG_TEST_URL"), "disposable PostgreSQL unavailable")
class LivePostgresTest(unittest.IsolatedAsyncioTestCase):
    async def test_driver_connects_migrations_and_unresolved_profile_stays_unready(self):
        url = os.environ["POSTGRES_RAG_TEST_URL"]
        async with postgres_connection(url) as connection:
            cursor = await connection.execute("SELECT id FROM enterprise_schema_migrations ORDER BY id")
            self.assertEqual([r["id"] for r in await cursor.fetchall()], [
                "001_enterprise_identity", "002_support_business_persistence",
                "003_job_ready_storeops", "004_job_ready_rag"])
            cursor = await connection.execute("SELECT extversion FROM pg_extension WHERE extname='vector'")
            self.assertEqual((await cursor.fetchone())["extversion"], "0.8.0")
        self.assertTrue(connection.closed)
        # Injected fixture only. Never a production embedding configuration.
        repository = PostgresRepository(lambda: postgres_connection(url), Profile("test-only", 2, 0.5))
        self.assertFalse(await repository.ready())
