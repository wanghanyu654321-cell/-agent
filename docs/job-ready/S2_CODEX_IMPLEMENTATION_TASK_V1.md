# S2 Real RAG — Codex GPT-6 Implementation Task V1

Status: **IMPLEMENTATION CONTRACT — CODEX GPT-6**

This task implements the frozen S2 architecture. It does not reopen architecture decisions.

## 1. Authoritative source

Repository: `wanghanyu654321-cell/-agent`

Branch: `job-search/sprint-v1`

Frozen S2 code/decision baseline:

- code/decision baseline commit: `02de0867169dd1ca36d31ed14d04efe4be7c4549`
- code/decision baseline tree: `bd8d8db493d80885e11bae1be93565cd9e653343`
- S2 decision: `docs/job-ready/S2_REAL_RAG_DECISION_V1.md`
- S2 acceptance Gate: `docs/job-ready/evidence/REAL_RAG_S2_GATE_V1.md`
- S1 implementation/review must remain intact.

Pure governance/documentation commits may exist after the frozen code baseline. **Implementation must start from the current remote `job-search/sprint-v1` HEAD**, provided that HEAD is a descendant of the frozen baseline and the post-baseline changes before coding are governance/documentation only (including this task contract and the Qoder verification contract). Do not reset/revert those governance commits merely to match `02de...`.

Before coding, record the actual starting HEAD/tree and verify the frozen baseline is an ancestor. If the current branch contains product-code changes after `02de...` that are not part of an already reviewed task, stop and reconcile before changing code.

## 2. Ownership rule

Codex GPT-6 owns all high-risk/high-coupling implementation for S2.

It may modify the minimum required implementation and test files for:

- successor RAG migration after `004`;
- Python embedding implementation and composition;
- PostgreSQL RAG repository integration;
- FastAPI real/deterministic embedding bootstrap;
- Node explicit vector retrieval composition;
- focused tests required by the S2 Gate;
- narrowly required dependency/container configuration.

It must not delegate core fixes to Qoder. Qoder is reserved for later low-risk execution/reproduction/reporting.

## 3. Decisions are frozen — do not redesign

Implement exactly the decisions in `S2_REAL_RAG_DECISION_V1.md`.

Key frozen facts:

### Hosted semantic profile

- profile ID: `openai-text-embedding-3-small-1536-v1`
- provider: OpenAI Embeddings API
- model: `text-embedding-3-small`
- dimensions: `1536`, explicitly requested
- encoding: float
- similarity: cosine
- S2 integration relevance floor: `-1.0`
- real hosted evidence input: public/synthetic data only

### Deterministic integration profile

- profile ID: `deterministic-test-1536-v1`
- dimensions: `1536`
- finite, non-zero, deterministic vectors
- no network call
- never describe this as real semantic embedding

### Defaults and safety

- lexical remains default;
- vector is explicit opt-in only;
- no Hybrid/RRF/reranker in S2;
- no ANN index in S2;
- no private-store hosted embedding egress;
- no runtime/tool timeout increase;
- no 0/1/2+ answerability change;
- no Pi Runtime/Safety rewrite.

## 4. Required implementation blocks

### A. Successor migration

Create the next unused migration after `004`.

It must:

1. leave migrations `001`–`004` byte-for-byte unchanged;
2. bind `rag_chunks.embedding` to `vector(1536)`;
3. replace the unresolved profile guard with an explicit DB constraint allowing only:
   - `openai-text-embedding-3-small-1536-v1`
   - `deterministic-test-1536-v1`;
4. preserve existing keys/FKs/immutability/least-privilege roles;
5. preserve bounded exact-scan design;
6. add no HNSW/IVFFlat;
7. work through the existing migration ledger/startup mechanism.

Do not merely drop `gap03_profile_unresolved` without a successor constraint.

### B. Python embedding seam

Reuse the existing `Embedding` protocol and current RAG core/repository seams.

Implement the smallest explicit compositions required for:

1. deterministic 1536 embedding for tests/integration;
2. hosted OpenAI embedding for the authorized real profile.

Hosted implementation requirements:

- use the official Python OpenAI client;
- pin the dependency exactly in `ai-service/requirements.txt`;
- explicit model `text-embedding-3-small`;
- explicit `dimensions=1536`;
- validate response length exactly 1536;
- reject nonfinite vectors;
- reject all-zero vectors;
- do not expose provider exception text/request bodies/credentials in FastAPI responses or logs;
- no hidden automatic retries in S2 unless the SDK can be configured to zero retries; configure zero retries where supported.

Do not add Torch, sentence-transformers, local weights or model caches.

### C. FastAPI composition

Current `rag_service.app` is intentionally unconfigured. Add a small explicit bootstrap/composition boundary.

Required behavior:

- missing/invalid DB/profile/config => unavailable/fail-closed;
- missing hosted credential => hosted profile unavailable/fail-closed;
- deterministic embedding is injectable for tests and not enabled by ordinary production env;
- PostgreSQL remains the only chunk persistence implementation;
- existing HTTP contract and safe-error behavior remain intact;
- search timeout remains <= 2s;
- ingestion gets a finite operator deadline independent from user-turn search;
- cancellation must not publish late success.

Avoid building a second application framework.

### D. Real PostgreSQL ingest/search

Close the existing actual path:

```text
registered approved document
 -> canonical chunks
 -> embedding
 -> transactional rag_chunks publish
 -> identical re-ingest = already_indexed
 -> scoped vector search
 -> bounded candidate result
```

Required fail-closed cases include:

- profile mismatch;
- dimension mismatch;
- nonfinite/zero vector;
- wrong scope/status/version;
- conflicting stored generation;
- cancellation/deadline during ingest/search.

No partial generation may remain after failed ingest.

### E. Node explicit vector composition

Update the smallest application composition/env seam necessary so:

- `ENTERPRISE_RETRIEVAL_MODE` keeps `lexical` as default;
- `vector` becomes an explicit supported mode;
- vector mode requires private FastAPI endpoint, service credential and approved embedding profile;
- Node uses existing `FastApiRetrievalService` + `PostgresRagRegistry`;
- Python candidates remain untrusted until current Node canonical reconciliation succeeds;
- private/browser ingest endpoint is not added;
- vector failures continue to fail closed through existing Runtime semantics.

Prefer one narrow factory/helper over a broad refactor or DI framework.

## 5. Protected files/behaviors

Do not change unless a Gate-blocking defect proves it is absolutely necessary:

- Pi package versions;
- core Agent loop semantics;
- `SupportAgentRuntime` limits: 4 turns, 6 tools, 10s overall, 2s per tool;
- sequential tool execution;
- Safety precedence;
- tenant/store/customer authority derivation;
- ordinary `0 / 1 / 2+` answerability;
- Ticket/Handoff semantics;
- S1 Harness contracts/review history;
- historical FIRST/failed/PR #9 evidence;
- lexical as default retrieval mode.

If a protected behavior must change, stop and return `BLOCKED — FROZEN CONTRACT CHANGE REQUIRED` with the exact reason. Do not silently expand scope.

## 6. Tests Codex must implement

Write focused tests during implementation for at least:

1. fresh migration path through successor migration;
2. DB dimension/profile enforcement;
3. deterministic embedding 1536 validation;
4. hosted embedding request configuration and malformed response rejection using mocks only;
5. Python real PostgreSQL ingest/search using deterministic embedding;
6. transactional rollback/no partial generation;
7. idempotent `already_indexed` behavior;
8. tenant/store/status/version/profile isolation;
9. FastAPI fail-closed config/credential behavior;
10. FastAPI search deadline/cancellation behavior;
11. Node vector env/composition validation;
12. Node canonical reconciliation rejects altered candidate metadata/content/chunk/profile/scope;
13. lexical default regression;
14. existing 0/1/2+ answerability remains unchanged under vector retrieval fixtures;
15. S1 Harness focused regression still passes.

Do not execute the paid hosted embedding call as part of coding unless the user separately authorizes that real external call and budget. Mock the hosted provider in ordinary tests.

## 7. Required implementation-time checks

Codex must run its own focused tests while coding. This is code-owner verification, not independent Gate evidence.

At minimum before commit:

- new Python focused tests;
- new Node focused tests;
- directly affected existing RAG/registry tests;
- S1 Harness focused tests;
- `npm run check`;
- `npm run build`;
- relevant Python unittest suite;
- `git diff --check`.

If Docker/PostgreSQL tests are locally available, run the focused real-PG deterministic path. If unavailable, report this explicitly; do not replace it with a fake PASS claim.

## 8. Diff discipline

Before commit run `git diff --name-only` and classify each changed file as one of:

- migration;
- Python RAG implementation;
- Node retrieval/application composition;
- dependency/container config;
- focused tests.

Any unrelated file must be reverted or justified before commit.

No PR, merge, release/tag or main-branch change in this task.

## 9. Commit

After focused implementation verification passes, commit/push to `job-search/sprint-v1`.

Suggested commit message:

`feat(rag): close real vector retrieval integration path`

## 10. Return packet

Return exactly these sections:

### A. Source
- branch
- commit SHA
- tree SHA

### B. Changed files
Path + purpose for every changed file.

### C. Migration proof
- successor migration number/name
- how vector(1536) is enforced
- how approved profiles are enforced
- confirmation 001–004 unchanged

### D. Embedding implementation
- deterministic profile behavior
- hosted profile request shape
- zero-retry behavior
- validation/failure behavior

### E. FastAPI composition
- env/config required
- fail-closed behavior
- deadlines/cancellation behavior

### F. PostgreSQL ingest/search
- transaction/idempotency path
- exact-search bound
- conflict/isolation behavior

### G. Node composition
- lexical default
- explicit vector config
- canonical reconciliation path

### H. Tests
Every command actually run and exact pass/fail/skip summary.

### I. Protected-contract check
Explicit YES/NO answers for whether the task changed:
- Pi pins
- Runtime limits
- Safety precedence
- 0/1/2+ answerability
- lexical default
- Ticket/Handoff semantics
- historical evidence

### J. Remaining gaps
Only facts not completed. Do not claim real hosted semantic execution if the paid/manual run was not performed.

## 11. Stop conditions

Stop rather than improvise if any of the following occurs:

- frozen dimension/profile cannot be implemented without rewriting 001–004;
- private-data egress becomes necessary;
- Runtime timeout increase appears necessary;
- vector path requires changing answerability;
- canonical Node authority would need weakening;
- a migration/transaction ambiguity could risk corrupting existing generations;
- real hosted API behavior materially conflicts with the frozen profile contract.

Return a bounded `BLOCKED` report instead of expanding the architecture.
