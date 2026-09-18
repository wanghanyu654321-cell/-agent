import asyncio
import json
import math
import unittest
import httpx
from rag_service.core import RetrievalError
from rag_service.embedding import DeterministicEmbedding, OpenAIEmbedding


class EmbeddingTests(unittest.IsolatedAsyncioTestCase):
    async def test_deterministic_1536_is_finite_nonzero_and_repeatable(self):
        embedding = DeterministicEmbedding()
        self.assertTrue(await embedding.ready())
        first = await embedding.embed("synthetic fixture 中文")
        self.assertEqual(len(first), 1536)
        self.assertTrue(all(math.isfinite(v) for v in first))
        self.assertGreater(math.hypot(*first), 0)
        self.assertEqual(first, await embedding.embed("synthetic fixture 中文"))
        self.assertNotEqual(first, await embedding.embed("another fixture"))

    async def test_official_sdk_request_shape_and_no_retry_on_429(self):
        calls = []
        def handler(request):
            calls.append(request)
            if len(calls) == 1:
                return httpx.Response(200, json={"object": "list", "model": "text-embedding-3-small",
                    "data": [{"index": 0, "object": "embedding", "embedding": [1.0] * 1536}],
                    "usage": {"prompt_tokens": 2, "total_tokens": 2}})
            return httpx.Response(429, json={"error": {"message": "PRIVATE_PROVIDER_ERROR", "type": "rate_limit"}})
        http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        embedding = OpenAIEmbedding("fixture-key", http_client=http)
        try:
            self.assertTrue(await embedding.ready())
            self.assertEqual(calls, [])  # readiness must not bill
            self.assertEqual(len(await embedding.embed("synthetic")), 1536)
            self.assertEqual(json.loads(calls[0].content), {"input": "synthetic", "model": "text-embedding-3-small",
                "dimensions": 1536, "encoding_format": "float"})
            self.assertEqual(str(calls[0].url), "https://api.openai.com/v1/embeddings")
            self.assertEqual(embedding.last_response_model, "text-embedding-3-small")
            with self.assertRaises(RetrievalError) as caught:
                await embedding.embed("synthetic")
            self.assertEqual(str(caught.exception), "retrieval_unavailable")
            self.assertEqual(len(calls), 2)
            self.assertEqual(embedding.client.max_retries, 0)
        finally:
            await embedding.close()

    async def test_malformed_provider_vectors_fail_closed(self):
        for vector in ([1.0], [0.0] * 1536, [float("nan")] * 1536,
                       [float("inf")] * 1536, [True] * 1536):
            with self.subTest(vector_type=type(vector[0]).__name__):
                http = httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(200,
                    content=json.dumps({"model": "text-embedding-3-small", "data": [{"index": 0, "embedding": vector}]}),
                    headers={"content-type": "application/json"})))
                embedding = OpenAIEmbedding("fixture-key", http_client=http)
                try:
                    with self.assertRaises(RetrievalError):
                        await embedding.embed("fixture")
                finally:
                    await embedding.close()

    async def test_provider_error_does_not_swallow_cancellation(self):
        started = asyncio.Event()
        async def handler(_):
            started.set()
            await asyncio.Event().wait()
        embedding = OpenAIEmbedding("fixture-key", http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
        try:
            task = asyncio.create_task(embedding.embed("fixture"))
            await started.wait()
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
        finally:
            await embedding.close()

    async def test_missing_key_is_unavailable(self):
        with self.assertRaises(RetrievalError):
            OpenAIEmbedding("")
