import unittest
from unittest.mock import patch
import httpx
from rag_service.bootstrap import build_service, create_configured_app
from rag_service.core import RetrievalError, RetrievalService
from rag_service.embedding import DeterministicEmbedding, DETERMINISTIC_PROFILE, HOSTED_PROFILE
from rag_service.postgres import PostgresRepository


def config():
    return {"RAG_DATABASE_URL": "postgresql://fixture@127.0.0.1/fixture",
            "RAG_SERVICE_CREDENTIAL": "fixture-service", "RAG_EMBEDDING_PROFILE": HOSTED_PROFILE,
            "RAG_EMBEDDING_MODE": "openai", "OPENAI_API_KEY": "fixture-key",
            "RAG_CORPUS_CLASSIFICATION": "public-synthetic", "RAG_INGEST_TIMEOUT_SECONDS": "30"}


class CompositionTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_invalid_configuration_stays_unavailable_without_secrets(self):
        variants = [{}]
        for key in config():
            env = config()
            del env[key]
            variants.append(env)
        variants += [{**config(), key: value} for key, value in (
            ("RAG_EMBEDDING_PROFILE", DETERMINISTIC_PROFILE), ("RAG_DATABASE_URL", "not-a-dsn"),
            ("RAG_DATABASE_URL", "postgresql://localhost:wrong/db"), ("RAG_SERVICE_CREDENTIAL", "bad\r\ncredential"),
            ("RAG_INGEST_TIMEOUT_SECONDS", "nan"), ("RAG_INGEST_TIMEOUT_SECONDS", "0"),
            ("RAG_CORPUS_CLASSIFICATION", "private"), ("RAG_EMBEDDING_MODE", "automatic"))]
        for env in variants:
            with self.subTest(keys=sorted(env)), patch("rag_service.bootstrap.OpenAIEmbedding") as hosted:
                app = create_configured_app(env)
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://private") as client:
                    response = await client.get("/health", headers={"Authorization": "Bearer fixture-service"})
                    self.assertIn(response.status_code, (401, 503))
                    self.assertNotIn("fixture-key", response.text)
                    self.assertNotIn("postgresql", response.text)
                hosted.assert_not_called()

    async def test_deterministic_only_by_explicit_injection_uses_existing_postgres_core(self):
        env = config()
        env.pop("OPENAI_API_KEY")
        env["RAG_EMBEDDING_PROFILE"] = DETERMINISTIC_PROFILE
        env["RAG_EMBEDDING_MODE"] = "deterministic"
        service = build_service(env, embedding=DeterministicEmbedding())
        self.assertIsInstance(service, RetrievalService)
        self.assertIsInstance(service.repository, PostgresRepository)
        self.assertEqual(service.profile.dimensions, 1536)
        self.assertEqual(service.profile.relevance_floor, -1.0)
        with self.assertRaises(RetrievalError):
            build_service(env)
        with self.assertRaises(RetrievalError):
            build_service(config(), embedding=DeterministicEmbedding())

    async def test_valid_hosted_composition_and_shutdown_close_sdk_without_calling_it(self):
        with patch("rag_service.bootstrap.OpenAIEmbedding") as hosted:
            from unittest.mock import AsyncMock
            hosted.return_value.close = AsyncMock()
            app = create_configured_app(config())
            async with app.router.lifespan_context(app):
                pass
            hosted.assert_called_once_with("fixture-key")
            hosted.return_value.close.assert_awaited_once()
