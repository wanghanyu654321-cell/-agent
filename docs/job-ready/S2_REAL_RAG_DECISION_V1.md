# S2 Real RAG Decision Freeze V1

Status: **APPROVED IMPLEMENTATION DECISION — S2 ONLY**

This document freezes the decisions that Codex must implement for Sprint S2. It is an architecture/evidence decision, not proof that S2 has been implemented or passed.

## 1. Authoritative source

Repository: `wanghanyu654321-cell/-agent`

S2 decision baseline:

- branch: `job-search/sprint-v1`
- decision parent commit: `187ca95cda57506605b9c00aaba7ad88b5998d26`
- decision parent tree: `7b951ec04df8f81f7d33717a5b43f1f8e0db8c3d`
- reviewed S1 implementation: `37fa81c3311bec4420b6202abb76107118f12efd`
- S1 verdict: `APPROVED WITH CONDITIONS`

Historical migrations `001`–`004`, historical FIRST/failed evidence and PR #9 evidence remain immutable.

## 2. S2 objective

S2 closes the **real vector retrieval execution path**, not retrieval-quality acceptance:

```text
approved public/synthetic knowledge
        ↓
Node registry registration
        ↓
FastAPI ingest
        ↓
real embedding OR deterministic CI embedding
        ↓
PostgreSQL vector(1536)
        ↓
FastAPI vector search
        ↓
Node canonical registry reconciliation
        ↓
existing RetrievalEvidence
        ↓
existing SupportAgentRuntime answerability
```

S2 must not change Safety precedence or ordinary `0 / 1 / 2+` answerability.

## 3. Frozen embedding profiles

### 3.1 Real semantic evidence profile

The only real hosted embedding profile authorized for S2 implementation is:

| Field | Frozen value |
| --- | --- |
| profile ID | `openai-text-embedding-3-small-1536-v1` |
| provider | OpenAI Embeddings API |
| model | `text-embedding-3-small` |
| endpoint family | `/v1/embeddings` |
| dimensions | **1536, explicitly requested** |
| encoding | float |
| similarity | cosine; existing core L2-normalizes vectors before dot product |
| S2 integration relevance floor | `-1.0` |
| execution class | explicitly authorized manual evidence run only |
| allowed input data | approved public benchmark or clearly synthetic test corpus only |
| forbidden input data | customer transcripts, private store knowledge, credentials, personal data, unpublished private corpus |

`-1.0` is an **integration floor**, not a quality threshold. It exists only so S2 can prove the vector path without inventing GAP-05 quality acceptance. S4 owns calibration/quality comparison.

The provider currently exposes the model alias `text-embedding-3-small`; a dated immutable embedding snapshot is not available in the reviewed provider documentation. Therefore S2 must record the requested model ID, response model ID where exposed, execution date and run evidence. S2 must **not** claim bitwise model-revision reproducibility.

### 3.2 Deterministic CI profile

CI/integration may use a deterministic injected embedding implementation with:

- profile ID: `deterministic-test-1536-v1`;
- dimensions: 1536;
- finite, non-zero deterministic vectors;
- no network/provider call;
- explicit `test/deterministic` evidence label.

It may prove schema, ingest/search, cancellation, isolation and Node reconciliation. It may not be called real semantic retrieval or real embedding quality.

## 4. Dependency decision

Do **not** add Torch, sentence-transformers, local model weights or a model cache to the S2 container. That would increase image size, build time and deployment complexity without adding proportional job-search evidence.

For the hosted profile, use the official Python OpenAI client and pin the dependency exactly in `ai-service/requirements.txt`. The implementation must not expose SDK exceptions, request bodies, API keys or provider response text through HTTP/logging.

Credentials:

- `OPENAI_API_KEY` exists only in the private `ai-service` process for the real manual run;
- Node/browser must never receive it;
- no secret is committed;
- missing credential keeps the real hosted composition unavailable/fail-closed.

## 5. Egress boundary

S2 does **not** authorize general private-corpus embedding egress.

The real hosted run must use a dedicated public/synthetic fixture set and evidence must name that corpus/hash. Existing private knowledge modes remain outside this hosted embedding claim.

The implementation must not silently make external embedding the default for the normal demo or private knowledge composition. Default retrieval remains lexical.

A future production/private egress policy requires a separate decision; S2 does not create one implicitly.

## 6. Migration 005 contract

Create exactly one new successor migration after `004`; determine the next unused filename at implementation time but do not edit `001`–`004`.

The migration must:

1. preserve the existing `rag_documents` / `rag_chunks` keys, FKs, immutability and least-privilege roles;
2. change `rag_chunks.embedding` from unconstrained `vector` to **`vector(1536)`**;
3. replace `gap03_profile_unresolved` rather than merely deleting protection;
4. allow only the two S2 profile IDs:
   - `openai-text-embedding-3-small-1536-v1`
   - `deterministic-test-1536-v1`
5. reject any other profile ID at the database boundary;
6. retain current tenant/store/profile indexes and bounded exact-scan design;
7. not add HNSW/IVFFlat in S2.

No ANN index is required in S2. The current repository intentionally performs a bounded exact scan (maximum 1024 rows) and computes normalized cosine candidates in the Python service. For the small portfolio/eval corpus, adding an ANN index would add an unmeasured tuning surface without closing a current proof gap.

A future profile/model/dimension requires a new migration; S2 does not make the profile registry dynamically editable.

## 7. FastAPI composition boundary

Current `rag_service.app` intentionally starts with an unconfigured `RetrievalService()` and returns unavailable. S2 may add a **small explicit composition/bootstrap module**; it must not turn FastAPI into a second application backend.

Required behavior:

- missing/invalid profile, DB configuration or real hosted credentials => health/search/ingest remains unavailable or startup fails closed without secret leakage;
- deterministic embedding is injectable from tests and is not silently enabled by ordinary production env;
- real hosted embedding is only constructed under an explicit S2 embedding mode/profile;
- PostgreSQL repository remains the only chunk persistence implementation;
- `Embedding` and `Repository` protocols remain the core seams;
- search timeout remains at most 2 seconds; S2 may not increase Runtime/tool budgets;
- ingestion may use a separately bounded operator deadline; it is not on the user turn critical path.

## 8. Node composition boundary

Current Node env parsing rejects vector mode. S2 may make `ENTERPRISE_RETRIEVAL_MODE=vector` a real **explicit opt-in** while keeping lexical as default.

Vector composition must require explicit values for:

- FastAPI private endpoint;
- service credential;
- embedding profile ID exactly matching the approved S2 real profile for real mode;
- PostgreSQL registry from the existing application pool.

Prefer one narrow pool-aware retrieval composition/factory seam if needed. Do not introduce a DI framework or second application container.

`FastApiRetrievalService` remains responsible for HTTP contract validation; `PostgresRagRegistry` remains Node authority for canonical document/chunk reconciliation. Python-returned candidate text/source/version is never independently authoritative.

## 9. Ingestion boundary

S2 does not add a public/browser knowledge-ingest endpoint.

Use the existing trusted registry registration plus operator/test invocation of `FastApiRetrievalService.ingest()`.

Required proof path:

```text
register approved document in Node/Postgres
        ↓
ingest exact document/version/profile
        ↓
embed canonical chunks
        ↓
transactional publish
        ↓
repeat ingest -> already_indexed
        ↓
search
        ↓
Node canonical reconciliation
```

Version/hash/profile conflicts fail closed and cannot silently overwrite a stored generation.

## 10. Search semantics

S2 preserves the existing FastAPI wire contract `topK: 3` and the current one-best-chunk-per-document candidate behavior.

S2 vector retrieval is a **single retrieval strategy**, not Hybrid. No lexical merge, RRF or reranker belongs in S2.

The complete set returned by the S2 vector strategy still flows into existing Node/Runtime evidence admission and `0 / 1 / 2+` answerability. S2 must not truncate candidates to manufacture a unique answer.

## 11. Required S2 evidence classes

### A. Deterministic clean-runner evidence

Must prove without external network:

- migration 005 applies from 001→005;
- `vector(1536)` is enforced;
- allowed/forbidden profile IDs are enforced;
- least privilege/readiness checks remain correct;
- ingest is transactional/idempotent;
- scope/status/version isolation remains fail-closed;
- deterministic 1536-vector search returns valid candidates;
- Node FastAPI response validation + PostgreSQL canonical reconciliation works;
- cancellation/deadline behavior does not weaken;
- existing lexical default remains unchanged.

### B. Real hosted embedding evidence

Separate, explicitly authorized manual run on public/synthetic data only:

- exact source/tree;
- corpus hash and public/synthetic classification;
- profile ID/model/dimensions;
- request count/token/cost if exposed;
- no automatic retry unless separately approved;
- actual ingest outcome;
- actual vector search result and latency;
- Node canonical reconciliation result;
- failures retained, not tuned away.

This evidence proves a real embedding/vector path. It does not by itself prove retrieval-quality PASS.

## 12. Protected behavior

S2 must not change:

- Pi package pins or Agent loop;
- SupportAgentRuntime limits: 4 turns / 6 tools / 10s overall / 2s per tool;
- sequential tool execution;
- Safety precedence;
- tenant/store/customer authority derivation;
- ordinary `0 / 1 / 2+` answerability;
- Ticket/Handoff semantics;
- S1 Harness historical commit/review;
- default lexical retrieval;
- historical FIRST/PR #9 evidence.

## 13. Explicitly not S2

Do not add:

- Hybrid retrieval;
- RRF;
- reranker;
- MCP;
- Pi AgentHarness migration;
- LangGraph;
- Redis/Kafka/Kubernetes;
- ANN index tuning;
- private customer/store data egress;
- public deployment/ICP/Nginx;
- CI architecture redesign;
- Answerability V2;
- new product UI/features.

## 14. Stop conditions

Stop and request a new decision if implementation requires:

- a dimension other than 1536;
- a hosted embedding model other than `text-embedding-3-small`;
- sending private/customer data externally;
- raising the 2s search/tool budget;
- changing `0 / 1 / 2+` semantics;
- adding an ANN index to make correctness pass;
- changing Pi Runtime/Safety;
- weakening registry canonical reconciliation;
- replacing PostgreSQL/pgvector;
- rewriting migrations 001–004.
