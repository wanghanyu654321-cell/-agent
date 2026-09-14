"""Frozen S2 embeddings; deterministic vectors prove plumbing, not relevance."""
from hashlib import shake_256

from openai import AsyncOpenAI

from .core import Profile, RetrievalError, valid_vector

DIMENSIONS = 1536
HOSTED_PROFILE = "openai-text-embedding-3-small-1536-v1"
DETERMINISTIC_PROFILE = "deterministic-test-1536-v1"


class DeterministicEmbedding:
    profile_id = DETERMINISTIC_PROFILE

    async def ready(self):
        return True

    async def embed(self, text):
        return tuple((value - 127.5) / 127.5 for value in shake_256(text.encode("utf-8")).digest(DIMENSIONS))


class OpenAIEmbedding:
    profile_id = HOSTED_PROFILE

    def __init__(self, api_key, *, http_client=None):
        if not isinstance(api_key, str) or not api_key.strip():
            raise RetrievalError()
        self.client = AsyncOpenAI(api_key=api_key, base_url="https://api.openai.com/v1",
                                  max_retries=0, timeout=2.0, http_client=http_client)
        self.last_response_model = None

    async def ready(self):
        # Configuration readiness only: health checks never call a billable API.
        return True

    async def embed(self, text):
        try:
            response = await self.client.embeddings.with_raw_response.create(input=text, model="text-embedding-3-small",
                dimensions=DIMENSIONS, encoding_format="float")
            # Validate before SDK model coercion (which can convert booleans to floats).
            payload = response.http_response.json()
            data = payload["data"]
            if len(data) != 1 or type(data[0]["index"]) is not int or data[0]["index"] != 0:
                raise RetrievalError()
            vector = valid_vector(data[0]["embedding"], Profile(self.profile_id, DIMENSIONS, -1.0))
            if payload.get("model") != "text-embedding-3-small":
                raise RetrievalError()
            self.last_response_model = payload["model"]
            return vector
        except Exception:
            # CancelledError remains cancellation; provider bodies and input stay private.
            raise RetrievalError() from None

    async def close(self):
        await self.client.close()
