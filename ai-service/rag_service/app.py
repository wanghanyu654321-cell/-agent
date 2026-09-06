"""Private service endpoints; no public documentation, corpus, or error details."""
import asyncio
import hmac
import json
import math
import os
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from .contracts import IngestRequest, SearchRequest
from .core import RetrievalError, RetrievalService


def strict_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate_key")
        result[key] = value
    return result


def reject_constant(_):
    raise ValueError("nonfinite_json")


def safe_error(request_id, code, status):
    return JSONResponse({"schemaVersion": "job-ready-v1", "requestId": request_id, "error": code}, status_code=status)


async def run_bounded(request, operation, seconds):
    """ASGI disconnect, caller cancellation, and finite deadline cancel the same task."""
    async def disconnected():
        while True:
            if (await request.receive())["type"] == "http.disconnect":
                return
    deadline = asyncio.get_running_loop().time() + seconds
    work = asyncio.create_task(operation())
    monitor = asyncio.create_task(disconnected())
    try:
        done, _ = await asyncio.wait((work, monitor), timeout=seconds, return_when=asyncio.FIRST_COMPLETED)
        if monitor in done:
            raise asyncio.CancelledError()
        if work not in done or asyncio.get_running_loop().time() >= deadline:
            raise RetrievalError()
        return await work
    finally:
        for task in (work, monitor):
            if not task.done():
                task.cancel()
        await asyncio.gather(work, monitor, return_exceptions=True)


def create_app(*, service=None, service_credential=None, search_timeout_seconds=2.0,
               ingest_timeout_seconds=None):
    if type(search_timeout_seconds) not in (int, float) or not math.isfinite(search_timeout_seconds) or not 0 < search_timeout_seconds <= 2:
        raise ValueError("invalid_search_deadline")
    if ingest_timeout_seconds is not None and (type(ingest_timeout_seconds) not in (int, float)
            or not math.isfinite(ingest_timeout_seconds) or ingest_timeout_seconds <= 0):
        raise ValueError("invalid_ingestion_deadline")
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    engine = service if service is not None else RetrievalService()
    credential = service_credential if service_credential is not None else os.environ.get("RAG_SERVICE_CREDENTIAL")

    async def dispatch(request, kind):
        deadline = asyncio.get_running_loop().time() + search_timeout_seconds
        request_id = uuid4().hex
        headers = request.headers.getlist("authorization")
        if not credential or len(headers) != 1 or not hmac.compare_digest(
                headers[0].encode("utf-8"), ("Bearer " + credential).encode("utf-8")):
            return safe_error(request_id, "unauthenticated", 401)
        try:
            if kind == "health":
                await run_bounded(request, engine.health, search_timeout_seconds)
                return JSONResponse({"schemaVersion": "job-ready-v1", "status": "ok"})
            if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
                raise RetrievalError("invalid_request", 400)
            limit = 8192 if kind == "ingest" else 32768
            body = bytearray()
            # Bound receipt too: an authenticated slow stream cannot occupy work forever.
            async with asyncio.timeout(search_timeout_seconds):
                async for chunk in request.stream():
                    body.extend(chunk)
                    if len(body) > limit:
                        raise RetrievalError("invalid_request", 400)
            try:
                value = json.loads(body.decode("utf-8", errors="strict"), object_pairs_hook=strict_object,
                                   parse_constant=reject_constant)
                dto = (IngestRequest if kind == "ingest" else SearchRequest).model_validate(value)
            except (ValueError, UnicodeError, ValidationError, RecursionError):
                raise RetrievalError("invalid_request", 400) from None
            request_id = dto.requestId
            if kind == "ingest" and ingest_timeout_seconds is None:
                raise RetrievalError()
            operation = (lambda: engine.ingest(dto)) if kind == "ingest" else (lambda: engine.search(dto))
            remaining = deadline - asyncio.get_running_loop().time()
            if remaining <= 0:
                raise RetrievalError()
            result = await run_bounded(request, operation, ingest_timeout_seconds if kind == "ingest" else remaining)
            payload = result.model_dump()
            encoded = json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")
            if len(encoded) > 262144:
                raise RetrievalError()
            return JSONResponse(payload)
        except RetrievalError as error:
            return safe_error(request_id, error.code, error.status)
        except Exception:
            # No upstream message, SQL, request body, path, or credential enters response/logs.
            return safe_error(request_id, "retrieval_unavailable", 503)

    @app.get("/health")
    async def health(request: Request):
        return await dispatch(request, "health")

    @app.post("/knowledge/ingest")
    async def ingest(request: Request):
        return await dispatch(request, "ingest")

    @app.post("/knowledge/search")
    async def search(request: Request):
        return await dispatch(request, "search")

    return app


app = create_app()
