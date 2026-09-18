# S2 C1 Clean Runner Failure V1

Status: **C1 FAIL — IMPLEMENTATION DEFECT CONFIRMED**

Source under review:

- implementation commit: `814f0565ef9b752b60e1eeead593d09696de69df`
- implementation tree: `8f2f442e32723ffec11aa2c81b0b395bb5fe6f07`
- Draft PR: `#10`
- GitHub Actions run: `34686326441`
- job: `independent-gate` / `103533819351`

## 1. What passed before the failure

The clean runner successfully started the frozen pgvector PostgreSQL service and passed the existing integrity, Node unit/runtime, PostgreSQL identity/business/application, Core A, Core B, and composed Job-Ready PostgreSQL application gates before reaching the S2 Python real-PostgreSQL step.

This proves the prior local blocker was removed: C1 reached the actual PostgreSQL path on a clean Ubuntu runner.

## 2. First real S2 failure

Step `Run Python deterministic contracts and real PostgreSQL driver gate` failed in all three `test_s2_postgres.S2PostgresTests` cases before ingest/search work.

Reproduced database error:

`psycopg.errors.InsufficientPrivilege: permission denied for schema public`

The failure occurs in `PostgresRepository.ready()` after the test switches to role `job_ready_rag_indexer`.

## 3. Root cause

`migrations/004_job_ready_rag.sql` creates the NOLOGIN roles and grants table privileges:

- `SELECT` on `rag_documents` to `job_ready_rag_indexer`;
- `SELECT,INSERT,DELETE` on `rag_chunks` to `job_ready_rag_indexer`;
- registry-writer table privileges.

However it does not explicitly grant `USAGE` on schema `public` to those roles.

The S2 successor `005_job_ready_rag_profiles.sql` binds `vector(1536)` and profile constraints but also does not add schema usage.

On the clean runner, the indexer therefore cannot resolve/access the explicitly schema-qualified `public.rag_documents` / `public.rag_chunks` relations used by `PostgresRepository.ready()`, even though table-level grants exist.

This is a least-privilege composition defect, not a request to broaden business-table privileges.

## 4. Classification

**IMPLEMENTATION DEFECT CONFIRMED.**

This is not:

- Docker/environment unavailability;
- flaky CI;
- hosted provider failure;
- RRF/reranker/hybrid issue;
- Retrieval architecture failure.

It is a narrow database permission omission exposed only when the real least-privilege indexer role is exercised.

## 5. Fix boundary

Return to Codex GPT-6 for a narrow fix only.

Preferred completion-first direction:

- preserve migrations `001–004` unchanged;
- keep the existing RAG architecture and role split;
- add only the minimum explicit schema permission required for the frozen RAG roles to use their already-granted RAG table privileges;
- do not grant business-table privileges;
- add/adjust focused tests proving schema usage plus existing least-privilege restrictions;
- preserve lexical default, Runtime limits, Safety, 0/1/2+ answerability, and all other S2 contracts.

Whether the correction is made inside the still-unintegrated `005` migration or as a new corrective successor must be decided consistently with the migration ledger/evidence boundary. Do not edit `001–004`.

## 6. Gate impact

S2 remains **APPROVED WITH CONDITIONS**, but C1 is now a reproduced implementation defect rather than an environment-only gap.

C1 cannot close until the narrow permission fix is committed and the Draft PR clean runner is rerun successfully through:

- Python real PostgreSQL S2 tests;
- Node ↔ Python ↔ PostgreSQL vector E2E;
- remaining build/check/regression steps.

`REAL HOSTED OPENAI EMBEDDING: NOT EXECUTED` remains separate.