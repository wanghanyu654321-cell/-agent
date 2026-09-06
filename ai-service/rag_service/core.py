"""Deterministic spans and exact cosine candidates under injected dependencies."""
import hashlib
import json
import math
from dataclasses import dataclass
from typing import AsyncContextManager, Protocol, Sequence

from .contracts import CandidateEvidence, IngestRequest, IngestResponse, SearchRequest, SearchResponse


class RetrievalError(Exception):
    def __init__(self, code="retrieval_unavailable", status=503):
        super().__init__(code)
        self.code, self.status = code, status


@dataclass(frozen=True)
class Profile:
    profile_id: str
    dimensions: int
    relevance_floor: float | None

    def validate(self):
        if (not self.profile_id or type(self.dimensions) is not int or self.dimensions <= 0
                or type(self.relevance_floor) not in (int, float)
                or not math.isfinite(self.relevance_floor) or not -1 <= self.relevance_floor <= 1):
            raise RetrievalError()


@dataclass(frozen=True)
class Document:
    tenant_id: str
    store_id: str
    document_id: str
    version: str
    kind: str
    content: str
    content_sha256: str
    source_ref: str
    status: str
    active: bool


@dataclass
class Chunk:
    tenant_id: str
    store_id: str
    document_id: str
    version: str
    profile_id: str
    chunk_id: str
    ordinal: int
    text: str
    chunk_sha256: str
    embedding: Sequence[float] = ()


class Embedding(Protocol):
    profile_id: str
    async def ready(self) -> bool: ...
    async def embed(self, text: str) -> Sequence[float]: ...


class IngestionTransaction(Protocol):
    async def document(self) -> Document | None: ...
    async def chunks(self) -> list[Chunk]: ...
    async def publish(self, chunks: list[Chunk]) -> None: ...


class Repository(Protocol):
    async def ready(self) -> bool: ...
    def ingestion(self, request: IngestRequest) -> AsyncContextManager[IngestionTransaction]: ...
    async def search_rows(self, request: SearchRequest) -> list[tuple[Document, Chunk]]: ...


def sha256(text: str) -> str:
    try:
        return hashlib.sha256(text.encode("utf-8", errors="strict")).hexdigest()
    except UnicodeError:
        raise RetrievalError("knowledge_version_conflict", 409) from None


def chunks_for(document: Document, profile_id: str) -> list[Chunk]:
    if not 1 <= len(document.content) <= 16000 or sha256(document.content) != document.content_sha256:
        raise RetrievalError("knowledge_version_conflict", 409)
    result = []
    for ordinal, start in enumerate(range(0, len(document.content), 2000)):
        text = document.content[start:start + 2000]
        digest = sha256(text)
        key = [document.tenant_id, document.store_id, document.document_id,
               document.version, profile_id, ordinal, digest]
        chunk_id = sha256(json.dumps(key, ensure_ascii=False, separators=(",", ":")))
        result.append(Chunk(document.tenant_id, document.store_id, document.document_id,
                            document.version, profile_id, chunk_id, ordinal, text, digest))
    return result


def valid_vector(vector, profile: Profile) -> tuple[float, ...]:
    if (len(vector) != profile.dimensions or any(type(v) not in (int, float)
            or not math.isfinite(v) for v in vector)):
        raise RetrievalError()
    norm = math.hypot(*vector)
    if norm == 0 or not math.isfinite(norm):
        raise RetrievalError()
    return tuple(v / norm for v in vector)


def chunk_identity(chunk: Chunk):
    return (chunk.tenant_id, chunk.store_id, chunk.document_id, chunk.version,
            chunk.profile_id, chunk.chunk_id, chunk.ordinal, chunk.text, chunk.chunk_sha256)


def rank_candidates(rows, request: SearchRequest, profile: Profile, vector):
    profile.validate()
    query = valid_vector(vector, profile)
    best = {}
    active_versions = {}
    for doc, chunk in rows:
        if (doc.tenant_id != request.scope.tenantId or doc.store_id != request.scope.storeId
                or not doc.active or doc.status != "approved" or doc.kind not in ("policy", "sop", "reference")
                or chunk.profile_id != profile.profile_id):
            continue
        previous_version = active_versions.setdefault(doc.document_id, doc.version)
        if previous_version != doc.version:
            raise RetrievalError()
        expected = chunks_for(doc, profile.profile_id)
        if (type(chunk.ordinal) is not int or not 0 <= chunk.ordinal < len(expected)
                or chunk_identity(chunk) != chunk_identity(expected[chunk.ordinal])):
            raise RetrievalError()
        normalized = valid_vector(chunk.embedding, profile)
        score = min(1.0, max(-1.0, sum(a * b for a, b in zip(query, normalized))))
        if score < profile.relevance_floor:
            continue
        key = (doc.document_id, doc.version)
        candidate = (score, doc, chunk)
        if key not in best or (-score, chunk.chunk_id) < (-best[key][0], best[key][2].chunk_id):
            best[key] = candidate
    ordered = sorted(best.values(), key=lambda row: (-row[0], row[1].document_id, row[2].chunk_id))[:3]
    return [CandidateEvidence(chunkId=chunk.chunk_id, documentId=doc.document_id,
                              version=doc.version, sourceRef=doc.source_ref, kind=doc.kind,
                              scope=request.scope, status="approved", contentSha256=doc.content_sha256,
                              chunkSha256=chunk.chunk_sha256, text=chunk.text, score=score,
                              rank=rank, embeddingProfileId=profile.profile_id)
            for rank, (score, doc, chunk) in enumerate(ordered, 1)]


class RetrievalService:
    def __init__(self, repository: Repository | None = None, embedding: Embedding | None = None,
                 profile: Profile | None = None):
        self.repository, self.embedding, self.profile = repository, embedding, profile

    def require_ready_config(self, profile_id=None):
        if self.repository is None or self.embedding is None or self.profile is None:
            raise RetrievalError()
        self.profile.validate()
        if self.embedding.profile_id != self.profile.profile_id or (
                profile_id is not None and profile_id != self.profile.profile_id):
            raise RetrievalError()

    async def health(self):
        self.require_ready_config()
        if not await self.embedding.ready() or not await self.repository.ready():
            raise RetrievalError()

    async def ingest(self, request: IngestRequest):
        self.require_ready_config(request.embeddingProfileId)
        await self.health()
        async with self.repository.ingestion(request) as transaction:
            doc = await transaction.document()
            if (doc is None or not doc.active or doc.status != "approved"
                    or (doc.tenant_id, doc.store_id, doc.document_id, doc.version) !=
                    (request.scope.tenantId, request.scope.storeId, request.documentId, request.version)):
                raise RetrievalError("not_found", 404)
            if doc.content_sha256 != request.contentSha256:
                raise RetrievalError("knowledge_version_conflict", 409)
            chunks = chunks_for(doc, self.profile.profile_id)
            existing = await transaction.chunks()
            if existing:
                if sorted(map(chunk_identity, existing)) != sorted(map(chunk_identity, chunks)):
                    raise RetrievalError("knowledge_version_conflict", 409)
                for chunk in existing:
                    valid_vector(chunk.embedding, self.profile)
                outcome = "already_indexed"
            else:
                for chunk in chunks:
                    chunk.embedding = valid_vector(await self.embedding.embed(chunk.text), self.profile)
                await transaction.publish(chunks)
                outcome = "indexed"
        return IngestResponse(schemaVersion="job-ready-v1", requestId=request.requestId, documentId=doc.document_id,
                              version=doc.version, contentSha256=doc.content_sha256,
                              embeddingProfileId=self.profile.profile_id,
                              chunkCount=len(chunks), outcome=outcome)

    async def search(self, request: SearchRequest):
        self.require_ready_config(request.embeddingProfileId)
        await self.health()
        vector = valid_vector(await self.embedding.embed(request.query), self.profile)
        rows = await self.repository.search_rows(request)
        return SearchResponse(schemaVersion="job-ready-v1", requestId=request.requestId,
                              candidates=rank_candidates(rows, request, self.profile, vector))
