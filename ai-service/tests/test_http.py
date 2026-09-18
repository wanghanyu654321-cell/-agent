import asyncio
import unittest
import httpx
from rag_service.app import create_app
from rag_service.core import RetrievalService
from test_core import MemoryRepository, FixtureEmbedding, PROFILE, document, search_request, ingest_request


class HTTPBoundary(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.repo = MemoryRepository([document()])
        self.engine = RetrievalService(self.repo, FixtureEmbedding(), PROFILE)
        self.app = create_app(service=self.engine, service_credential="fixture-secret", ingest_timeout_seconds=1)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://private",
                                        headers={"Authorization": "Bearer fixture-secret"})

    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_all_three_endpoints_require_service_auth(self):
        for method, path in (("GET", "/health"), ("POST", "/knowledge/ingest"), ("POST", "/knowledge/search")):
            response = await self.client.request(method, path, headers={"Authorization": "Bearer invalid-private-credential"})
            self.assertEqual(response.status_code, 401)
            self.assertEqual(response.json()["error"], "unauthenticated")
            self.assertNotIn("invalid-private-credential", response.text)

    async def test_health_disabled_by_default_and_no_public_docs(self):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app(service_credential="fixture-secret")),
                                    base_url="http://private", headers=self.client.headers) as client:
            self.assertEqual((await client.get("/health")).status_code, 503)
        self.assertEqual((await self.client.get("/health")).json(), {"schemaVersion": "job-ready-v1", "status": "ok"})
        for path in ("/docs", "/redoc", "/openapi.json"):
            self.assertEqual((await self.client.get(path)).status_code, 404)

    async def test_ingestion_and_search_exact_envelopes(self):
        response = await self.client.post("/knowledge/ingest", json=ingest_request().model_dump())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["outcome"], "indexed")
        response = await self.client.post("/knowledge/search", json=search_request().model_dump())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.json()), {"schemaVersion", "requestId", "candidates"})
        self.assertEqual(response.json()["candidates"][0]["documentId"], "d1")
        self.assertNotIn("access-control-allow-origin", response.headers)

    async def test_strict_json_and_safe_validation_errors(self):
        bodies = ['{"query":"private customer","query":"duplicate"}', '{"value":NaN}',
                  '{"query":"\\ud800"}', '{not json}', '[]']
        for body in bodies:
            response = await self.client.post("/knowledge/search", content=body, headers={"Content-Type": "application/json"})
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json()["error"], "invalid_request")
            self.assertNotIn("private", response.text)
        response = await self.client.post("/knowledge/search", content="{}", headers={"Content-Type": "text/plain"})
        self.assertEqual(response.status_code, 400)

    async def test_streamed_body_bound_without_content_length(self):
        async def stream():
            for _ in range(9):
                yield b"x" * 1024
        response = await self.client.post("/knowledge/ingest", content=stream(), headers={"Content-Type": "application/json"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "invalid_request")

    async def test_dependency_failure_is_503_without_exception_leak(self):
        async def fail(request):
            raise RuntimeError("password=private C:/secret SELECT SQL")
        self.repo.search_rows = fail
        response = await self.client.post("/knowledge/search", json=search_request().model_dump())
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["error"], "retrieval_unavailable")
        self.assertNotIn("private", response.text)
        self.assertNotIn("candidates", response.json())

    async def test_deadline_cancels_work_no_late_result(self):
        cancelled = asyncio.Event()
        async def slow(text):
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()
        self.engine.embedding.embed = slow
        # Leave enough budget for ASGI/validation startup on Windows; the
        # embedding never completes, so expiry still exercises cancellation.
        app = create_app(service=self.engine, service_credential="fixture-secret", search_timeout_seconds=0.2)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://private", headers=self.client.headers) as client:
            response = await client.post("/knowledge/search", json=search_request().model_dump())
        self.assertEqual(response.status_code, 503)
        self.assertTrue(cancelled.is_set())

    async def test_disconnect_cancels_dependency(self):
        started, cancelled = asyncio.Event(), asyncio.Event()
        async def slow(text):
            started.set()
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()
        self.engine.embedding.embed = slow
        raw = search_request().model_dump_json().encode()
        sent_body = False
        async def receive():
            nonlocal sent_body
            if not sent_body:
                sent_body = True
                return {"type": "http.request", "body": raw, "more_body": False}
            await started.wait()
            return {"type": "http.disconnect"}
        output = []
        async def send(message):
            output.append(message)
        scope = {"type": "http", "http_version": "1.1", "method": "POST", "scheme": "http", "path": "/knowledge/search",
                 "raw_path": b"/knowledge/search", "query_string": b"", "root_path": "", "server": ("private", 80),
                 "client": ("test", 123), "headers": [(b"authorization", b"Bearer fixture-secret"), (b"content-type", b"application/json")]}
        with self.assertRaises(asyncio.CancelledError):
            await self.app(scope, receive, send)
        self.assertTrue(cancelled.is_set())
        self.assertFalse(output)
