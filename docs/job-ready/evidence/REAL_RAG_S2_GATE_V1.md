# Real RAG S2 Gate V1

Status: **IMPLEMENTATION ACCEPTANCE GATE — NOT YET PASSED**

This Gate evaluates Sprint S2 against `docs/job-ready/S2_REAL_RAG_DECISION_V1.md`.

Passing S2 proves a real vector retrieval execution path plus deterministic integration proof. It does **not** prove retrieval-quality PASS, production readiness, private-data egress approval, Hybrid/RRF benefit, or real-provider Agent quality.

## 1. Source boundary

Implementation branch: `job-search/sprint-v1`

Decision baseline before S2 implementation:

- branch HEAD before decision docs: `187ca95cda57506605b9c00aaba7ad88b5998d26`
- parent tree: `7b951ec04df8f81f7d33717a5b43f1f8e0db8c3d`
- S1 implementation: `37fa81c3311bec4420b6202abb76107118f12efd`
- S1 review: `APPROVED WITH CONDITIONS`

S2 implementation must start from the current sprint branch after this decision/Gate documentation and must not rewrite S1 history.

## 2. Required implementation outcome

S2 must demonstrate both paths below.

### Deterministic integration path

```text
approved fixture
 -> Node registry
 -> FastAPI ingest
 -> deterministic 1536 embedding
 -> PostgreSQL vector(1536)
 -> FastAPI search
 -> Node canonical reconciliation
 -> RetrievalEvidence
```

### Real semantic path

```text
approved public/synthetic fixture
 -> Node registry
 -> FastAPI ingest
 -> OpenAI text-embedding-3-small (dimensions=1536)
 -> PostgreSQL vector(1536)
 -> FastAPI search
 -> Node canonical reconciliation
```

The real path may be a separately authorized manual evidence run. CI must not require a paid external call.

## 3. Required profile enforcement

Database and composition must enforce the S2 profile decisions.

Accepted chunk profile IDs:

- `openai-text-embedding-3-small-1536-v1`
- `deterministic-test-1536-v1`

Required dimension: `1536`.

A wrong dimension, unknown profile, zero/nonfinite vector or profile mismatch must fail closed.

The real hosted profile must explicitly request 1536 dimensions. Do not rely on an undocumented/default dimension assumption in implementation evidence.

## 4. Mandatory migration checks

S2 cannot PASS unless the new migration proves:

1. fresh 001→005-equivalent migration path succeeds;
2. migrations 001–004 were not edited;
3. `rag_chunks.embedding` is `vector(1536)`;
4. `gap03_profile_unresolved` no longer blocks approved profiles;
5. unapproved profile IDs remain blocked by a successor constraint;
6. current PK/FK/version/scope structure remains valid;
7. current least-privilege role behavior remains valid;
8. no ANN index is added;
9. applying the migration through the existing migration ledger is idempotent at application startup level.

If the next migration number is not 005 at implementation time, use the next unused number and record it. The semantic requirements do not change.

## 5. FastAPI mandatory checks

Tests must prove:

- missing configuration/credential remains unavailable/fail-closed;
- deterministic profile can be injected without network;
- hosted profile validates exact provider/model/profile/dimension configuration;
- malformed provider output, wrong length, nonfinite or zero vector is rejected;
- provider/SQL/credential details do not leak through HTTP errors;
- ingestion completes validation/embedding before publication and rollback leaves no partial generation;
- identical second ingest returns `already_indexed`;
- conflicting stored generation returns conflict/failure according to existing contract;
- search remains bounded and scope/profile/status constrained;
- search deadline remains `<= 2s`;
- client cancellation does not publish late success.

## 6. Node mandatory checks

Tests must prove:

- lexical remains the default retrieval mode;
- explicit vector mode requires all vector configuration;
- vector composition uses `FastApiRetrievalService` plus the existing `PostgresRagRegistry` authority;
- FastAPI candidates with altered source/version/content/chunk/profile/scope are rejected by canonical reconciliation;
- vector retrieval errors fail closed through the existing Runtime behavior;
- S2 does not change ordinary 0/1/2+ answerability;
- no new public ingestion endpoint is introduced.

## 7. Egress controls for the S2 real run

The S2 real hosted run is authorized only for public/synthetic data **after explicit user approval of the actual call/budget**.

The evidence packet must identify the corpus/hash and state that no private customer/store data was included.

Implementation must not silently route the existing private knowledge mode through hosted embeddings by default.

If the implementation cannot reliably separate the S2 public/synthetic evidence composition from private knowledge, the real hosted run is `BLOCKED`; do not weaken the boundary to make it run.

## 8. Required focused tests

Codex must create focused tests covering at least:

- migration/profile enforcement;
- Python embedding/provider validation;
- Python real PostgreSQL repository path using deterministic embedding;
- Node FastAPI adapter/canonical reconciliation;
- Node application vector composition/env validation;
- lexical-default regression;
- timeout/cancellation regression.

The exact commands may follow the repository's actual test structure. They must be listed in the review packet.

## 9. Existing regression requirements

Before S2 is accepted for integration, rerun the directly affected existing gates, including:

- Core B PostgreSQL RAG/registry gate;
- composed Job-Ready PostgreSQL HTTP/application gate where affected;
- Python unittest suite;
- Node retrieval/Runtime evidence-routing tests;
- S1 Harness focused tests;
- `npm run check`;
- `npm run build`.

The final sprint Gate still owes the independent clean-runner condition recorded by the S1 review.

## 10. Real hosted evidence packet

A real hosted embedding run, when separately authorized, must record:

- exact source commit/tree;
- profile ID;
- requested model ID;
- returned model ID if exposed;
- explicit dimensions=1536;
- corpus ID/hash and public/synthetic classification;
- number of embedding requests and tokens/cost if available;
- ingest outcome (`indexed` / `already_indexed`);
- search query ID or sanitized case ID;
- returned document IDs/versions/sourceRefs/scores;
- Node canonical reconciliation outcome;
- latency including query embedding;
- timeout/failure outcomes without silent exclusion;
- zero automatic retries unless separately approved.

No real-run artifact may include credentials or private corpus text.

## 11. Claims allowed after S2 PASS

Allowed:

- real hosted embedding path executed on public/synthetic corpus;
- pgvector `vector(1536)` integration;
- transactional/idempotent RAG ingest;
- scoped vector search;
- Node canonical evidence reconciliation;
- deterministic clean-runner integration evidence.

Not allowed:

- retrieval quality PASS;
- production RAG;
- private-store hosted embedding approval;
- Hybrid/RRF/reranker benefit;
- real-provider Agent quality PASS;
- production/public deployment.

## 12. Rejection conditions

S2 is `REJECTED` if any implementation:

- edits migrations 001–004;
- weakens scope/status/version/canonical reconciliation;
- silently enables hosted embedding for private corpus;
- makes vector the default retrieval mode;
- increases Runtime/tool timeout budgets;
- changes 0/1/2+ answerability;
- hides real provider/embedding failures as empty success;
- uses deterministic vectors and labels them real embeddings;
- adds Hybrid/RRF/reranker/ANN tuning to make S2 pass;
- exposes credentials/provider exceptions in evidence or API errors.

## 13. Verdict vocabulary

Use exactly one:

- `APPROVED`
- `APPROVED WITH CONDITIONS`
- `REJECTED`
- `INFORMATION INSUFFICIENT`

Green unit tests alone are insufficient if profile, egress, canonical authority or evidence claims violate this Gate.
