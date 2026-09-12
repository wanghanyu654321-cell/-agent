import json
import tempfile
import unittest
from pathlib import Path

import httpx

from rag_service.core import RetrievalError
from rag_service.embedding import OpenAIEmbedding
from s2_c2_provider_diagnostics import DiagnosticRecorder, RecordingTransport


class ProviderDiagnosticsTests(unittest.IsolatedAsyncioTestCase):
    async def _failed_embedding(self, responder):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "provider-diagnostic.jsonl"
            recorder = DiagnosticRecorder(path)
            client = httpx.AsyncClient(transport=RecordingTransport(httpx.MockTransport(responder), recorder))
            embedding = OpenAIEmbedding("sk-test-DO-NOT-LEAK-123", http_client=client)
            started_at = recorder.sequence
            try:
                with self.assertRaises(RetrievalError):
                    await embedding.embed("synthetic input body")
                category = recorder.record_failure_since(started_at, 2.0)
            finally:
                await embedding.close()
            return category, path.read_text(encoding="utf-8"), recorder.events

    async def test_timeout_and_network_are_classified_without_network_access(self):
        for failure, expected in ((httpx.TimeoutException("do not log"), "timeout"),
                                  (httpx.NetworkError("do not log"), "network"),
                                  (httpx.ProtocolError("do not log"), "transport_error")):
            with self.subTest(expected=expected):
                def responder(_):
                    raise failure

                category, _, _ = await self._failed_embedding(responder)
                self.assertEqual(category, expected)

    async def test_http_failures_are_classified_without_provider_bodies(self):
        for status_code, expected in ((401, "http_401"), (429, "http_429"), (400, "http_4xx"),
                                      (403, "http_4xx"), (500, "http_5xx"), (503, "http_5xx")):
            with self.subTest(status_code=status_code):
                category, _, events = await self._failed_embedding(lambda _: httpx.Response(
                    status_code, json={"error": {"message": "response body sk-test-DO-NOT-LEAK-123"}}))
                self.assertEqual(category, expected)
                response = next(event for event in events if event["event"] == "provider_response")
                self.assertEqual(response["sequence"], 1)
                self.assertEqual(response["statusCode"], status_code)
                self.assertEqual(response["statusClass"], f"{status_code // 100}xx")
                self.assertIsInstance(response["latencyMs"], float)

    async def test_2xx_adapter_rejection_and_unknown_before_response_are_classified(self):
        category, _, _ = await self._failed_embedding(lambda _: httpx.Response(200, json={
            "model": "text-embedding-3-small", "data": []}))
        self.assertEqual(category, "http_2xx_adapter_rejected")

        with tempfile.TemporaryDirectory() as directory:
            recorder = DiagnosticRecorder(Path(directory) / "provider-diagnostic.jsonl")
            self.assertEqual(recorder.record_failure_since(recorder.sequence, 1.0), "unknown_before_response")

    async def test_success_metadata_and_sanitization_are_limited_to_allowlisted_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "provider-diagnostic.jsonl"
            recorder = DiagnosticRecorder(path)
            client = httpx.AsyncClient(transport=RecordingTransport(httpx.MockTransport(lambda _: httpx.Response(
                200, json={"model": "text-embedding-3-small", "data": [{"index": 0, "embedding": [1.0] * 1536}]})),
                recorder))
            embedding = OpenAIEmbedding("sk-test-DO-NOT-LEAK-123", http_client=client)
            started_at = recorder.sequence
            try:
                vector = await embedding.embed("synthetic input body")
                recorder.record_success_since(started_at, embedding.last_response_model, len(vector), 2.0)
                self.assertEqual(embedding.client.max_retries, 0)
                self.assertEqual(embedding.client.timeout, 2.0)
            finally:
                await embedding.close()

            output = path.read_text(encoding="utf-8")
            for forbidden in ("OPENAI_API_KEY", "Authorization", "Bearer", "sk-", "synthetic input body",
                              "response body"):
                self.assertNotIn(forbidden, output)
            events = [json.loads(line) for line in output.splitlines()]
            self.assertEqual(events[-1], {"event": "provider_embedding_succeeded", "sequence": 1,
                                          "returnedModelId": "text-embedding-3-small", "dimensions": 1536,
                                          "latencyMs": 2.0})


if __name__ == "__main__":
    unittest.main()
