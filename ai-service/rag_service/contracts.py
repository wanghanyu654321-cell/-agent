"""Frozen job-ready-v1 wire DTOs. No coercion or caller-added authority."""
from typing import Annotated, Literal
from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StrictInt, field_validator

def nonblank(value):
    if not value.strip() or "\x00" in value:
        raise ValueError("invalid_text")
    return value


Identifier = Annotated[str, Field(min_length=1, max_length=200), AfterValidator(nonblank)]
Hash = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]


def check_unicode(value):
    if isinstance(value, str):
        value.encode("utf-8", errors="strict")
    elif isinstance(value, dict):
        for key, item in value.items():
            check_unicode(key)
            check_unicode(item)
    elif isinstance(value, (list, tuple)):
        for item in value:
            check_unicode(item)
    return value


class StrictDTO(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)

    @field_validator("*", mode="before")
    @classmethod
    def valid_unicode(cls, value):
        try:
            return check_unicode(value)
        except UnicodeError:
            raise ValueError("invalid_unicode") from None


class Scope(StrictDTO):
    tenantId: Identifier
    storeId: Identifier


class RequestDTO(StrictDTO):
    schemaVersion: Literal["job-ready-v1"]
    requestId: Identifier
    scope: Scope
    embeddingProfileId: Identifier


class IngestRequest(RequestDTO):
    documentId: Identifier
    version: Identifier
    contentSha256: Hash


class SearchRequest(RequestDTO):
    query: Annotated[str, Field(min_length=1, max_length=4000), AfterValidator(nonblank)]
    topK: Annotated[StrictInt, Field(ge=3, le=3)]


class IngestResponse(StrictDTO):
    schemaVersion: Literal["job-ready-v1"]
    requestId: Identifier
    documentId: Identifier
    version: Identifier
    contentSha256: Hash
    embeddingProfileId: Identifier
    chunkCount: Annotated[StrictInt, Field(ge=1, le=8)]
    outcome: Literal["indexed", "already_indexed"]


class CandidateEvidence(StrictDTO):
    chunkId: Hash
    documentId: Identifier
    version: Identifier
    sourceRef: Annotated[str, Field(min_length=1), AfterValidator(nonblank)]
    kind: Literal["policy", "sop", "reference"]
    scope: Scope
    status: Literal["approved"]
    contentSha256: Hash
    chunkSha256: Hash
    text: Annotated[str, Field(min_length=1, max_length=2000)]
    score: Annotated[float, Field(ge=-1, le=1)]
    rank: Annotated[StrictInt, Field(ge=1, le=3)]
    embeddingProfileId: Identifier


class SearchResponse(StrictDTO):
    schemaVersion: Literal["job-ready-v1"]
    requestId: Identifier
    candidates: Annotated[list[CandidateEvidence], Field(max_length=3)]
