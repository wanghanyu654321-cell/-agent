"""Explicit S2 composition. Missing configuration keeps the private API unavailable."""
import math
import os
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from .app import create_app
from .connection import postgres_connection
from .core import Profile, RetrievalError, RetrievalService
from .embedding import DETERMINISTIC_PROFILE, DIMENSIONS, HOSTED_PROFILE, OpenAIEmbedding
from .postgres import PostgresRepository


def ingest_timeout(env):
    try:
        seconds = float(env["RAG_INGEST_TIMEOUT_SECONDS"])
        if not math.isfinite(seconds) or seconds <= 0:
            raise ValueError()
        return seconds
    except (KeyError, ValueError, TypeError):
        raise RetrievalError() from None


def build_service(env, *, embedding=None):
    try:
        database_url = env["RAG_DATABASE_URL"].strip()
        address = urlsplit(database_url)
        if address.scheme not in ("postgres", "postgresql") or not address.hostname or len(address.path) < 2:
            raise ValueError()
        if address.port is not None and not 1 <= address.port <= 65535:
            raise ValueError()
        credential = env["RAG_SERVICE_CREDENTIAL"]
        if (not credential.strip() or len(credential) > 4096 or "\r" in credential or "\n" in credential
                or env["RAG_CORPUS_CLASSIFICATION"] != "public-synthetic"):
            raise ValueError()
        ingest_timeout(env)
        profile_id = env["RAG_EMBEDDING_PROFILE"]
        if embedding is None:
            if env["RAG_EMBEDDING_MODE"] != "openai" or profile_id != HOSTED_PROFILE:
                raise ValueError()
            key = env["OPENAI_API_KEY"].strip()
            if not key:
                raise ValueError()
        elif (env["RAG_EMBEDDING_MODE"] != "deterministic" or profile_id != DETERMINISTIC_PROFILE
              or embedding.profile_id != DETERMINISTIC_PROFILE):
            raise ValueError()
    except (KeyError, ValueError, TypeError, AttributeError):
        raise RetrievalError() from None
    profile = Profile(profile_id, DIMENSIONS, -1.0)  # Integration floor, not a quality claim.
    repository = PostgresRepository(lambda: postgres_connection(database_url), profile)
    return RetrievalService(repository=repository, embedding=OpenAIEmbedding(key) if embedding is None else embedding,
                            profile=profile)


def create_configured_app(env=None, *, embedding=None):
    env = os.environ if env is None else env
    credential = env.get("RAG_SERVICE_CREDENTIAL", "")
    try:
        service = build_service(env, embedding=embedding)
    except RetrievalError:
        return create_app(service_credential=credential)
    app = create_app(service=service, service_credential=credential, search_timeout_seconds=2.0,
                     ingest_timeout_seconds=ingest_timeout(env))
    if embedding is None:
        @asynccontextmanager
        async def lifespan(_):
            try:
                yield
            finally:
                await service.embedding.close()
        app.router.lifespan_context = lifespan
    return app


app = create_configured_app()
