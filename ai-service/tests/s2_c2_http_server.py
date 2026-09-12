"""One-time C2 evidence server. Calls the unchanged production OpenAIEmbedding path and logs only sanitized metadata."""
import json
import os
import socket
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import httpx
import uvicorn
from openai import DefaultAsyncHttpxClient
from rag_service.bootstrap import create_configured_app
from rag_service.core import RetrievalError
from rag_service.embedding import OpenAIEmbedding
from s2_c2_provider_diagnostics import DiagnosticRecorder, RecordingTransport

TRACE_PATH = Path(os.environ["C2_TRACE_PATH"])
DIAGNOSTICS = DiagnosticRecorder(Path(os.environ["C2_DIAGNOSTIC_PATH"]))
_original_init = OpenAIEmbedding.__init__
_original_embed = OpenAIEmbedding.embed
_embed_count = 0


def _instrumented_init(self, api_key, *, http_client=None):
    if http_client is None:
        http_client = DefaultAsyncHttpxClient(
            transport=RecordingTransport(httpx.AsyncHTTPTransport(), DIAGNOSTICS))
    _original_init(self, api_key, http_client=http_client)


async def _counted_embed(self, text):
    global _embed_count
    started = time.perf_counter()
    diagnostic_started_at = DIAGNOSTICS.sequence
    try:
        vector = await _original_embed(self, text)
    except RetrievalError:
        DIAGNOSTICS.record_failure_since(diagnostic_started_at, (time.perf_counter() - started) * 1000)
        raise
    _embed_count += 1
    latency_ms = round((time.perf_counter() - started) * 1000, 3)
    DIAGNOSTICS.record_success_since(diagnostic_started_at, self.last_response_model, len(vector), latency_ms)
    event = {
        "event": "provider_embedding_succeeded",
        "sequence": _embed_count,
        "returnedModelId": self.last_response_model,
        "dimensions": len(vector),
        "latencyMs": latency_ms,
    }
    with TRACE_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, ensure_ascii=False) + "\n")
    return vector


OpenAIEmbedding.__init__ = _instrumented_init
OpenAIEmbedding.embed = _counted_embed

if __name__ == "__main__":
    app = create_configured_app(os.environ)
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        print(json.dumps({"port": listener.getsockname()[1]}), flush=True)
        uvicorn.Server(uvicorn.Config(app, access_log=False, log_level="error")).run(sockets=[listener])
