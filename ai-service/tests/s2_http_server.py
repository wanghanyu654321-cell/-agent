"""Test-only process entrypoint. Never copied into the production image."""
import json
import os
import socket
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import uvicorn
from rag_service.bootstrap import create_configured_app
from rag_service.embedding import DeterministicEmbedding

if __name__ == "__main__":
    app = create_configured_app(os.environ, embedding=DeterministicEmbedding())
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        print(json.dumps({"port": listener.getsockname()[1]}), flush=True)
        uvicorn.Server(uvicorn.Config(app, access_log=False, log_level="error")).run(sockets=[listener])
