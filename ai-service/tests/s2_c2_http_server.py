"""One-time C2 evidence server. Calls the unchanged production OpenAIEmbedding path and logs only sanitized metadata."""
import json
import os
import socket
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import uvicorn
from rag_service.bootstrap import create_configured_app
from rag_service.embedding import OpenAIEmbedding

TRACE_PATH = Path(os.environ["C2_TRACE_PATH"])
_original_embed = OpenAIEmbedding.embed
_embed_count = 0


async def _counted_embed(self, text):
    global _embed_count
    started = time.perf_counter()
    vector = await _original_embed(self, text)
    _embed_count += 1
    event = {
        "sequence": _embed_count,
        "returnedModelId": self.last_response_model,
        "dimensions": len(vector),
        "latencyMs": round((time.perf_counter() - started) * 1000, 3),
        "inputCharacters": len(text),
    }
    with TRACE_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, ensure_ascii=False) + "\n")
    return vector


OpenAIEmbedding.embed = _counted_embed

if __name__ == "__main__":
    app = create_configured_app(os.environ)
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        print(json.dumps({"port": listener.getsockname()[1]}), flush=True)
        uvicorn.Server(uvicorn.Config(app, access_log=False, log_level="error")).run(sockets=[listener])
