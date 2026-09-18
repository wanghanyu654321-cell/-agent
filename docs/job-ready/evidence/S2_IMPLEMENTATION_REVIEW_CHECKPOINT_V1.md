# S2 Vector Retrieval — Implementation Review Checkpoint V1

Status: **CODE REVIEW PASSED TO INDEPENDENT VERIFICATION — S2 GATE NOT YET PASSED**

Reviewed implementation:

- branch: `job-search/sprint-v1`
- implementation commit: `814f0565ef9b752b60e1eeead593d09696de69df`
- implementation tree: `8f2f442e32723ffec11aa2c81b0b395bb5fe6f07`
- implementation parent / completion-first baseline: `0a34396de48657a05540cbce897afd36bd39c87a`
- governing decision: `docs/job-ready/S2_REAL_RAG_DECISION_V1.md`
- governing gate: `docs/job-ready/evidence/REAL_RAG_S2_GATE_V1.md`
- completion-first addendum: `docs/job-ready/S2_COMPLETION_FIRST_ADDENDUM_V1.md`

This checkpoint is a GitHub-side code/diff review. It does not replace independent execution of the deterministic PostgreSQL/Docker path or a separately authorized hosted embedding run.

## 1. Scope / completion-first result

Implementation is one commit ahead of the completion-first baseline and changes 22 files. The change shape remains a completion patch rather than a retrieval rewrite:

- successor migration only; migrations 001-004 are not changed in the reviewed diff;
- two small Python implementation modules (`embedding.py`, `bootstrap.py`);
- small readiness change in the existing PostgreSQL repository;
- one thin Node vector-composition factory;
- narrow Enterprise application wiring;
- dependency/container configuration;
- focused Node/Python/integration tests;
- two lines added to the existing CI test step to execute the new cross-language deterministic test.

No reviewed change introduces Hybrid, RRF, reranking, ANN, a new Retrieval interface hierarchy, a DI container, a second Agent runtime, or a lexical rewrite.

**Completion-first scope: PASS.**

## 2. Migration review

`005_job_ready_rag_profiles.sql` preserves 001-004 and performs only the frozen successor work:

- `rag_chunks.embedding` -> `vector(1536)`;
- drops the intentional `gap03_profile_unresolved` blocker;
- replaces it with `rag_chunks_s2_profile` allowing only the frozen hosted and deterministic profile IDs;
- does not add ANN indexes.

Because migration 004 intentionally made all `rag_chunks` inserts impossible through `CHECK(false)`, this successor does not need to reinterpret an existing valid chunk generation population before binding the dimension/profile constraints.

**Migration design review: PASS, pending real PostgreSQL execution evidence.**

## 3. Embedding implementation review

The implementation reuses the existing `Embedding` protocol and `RetrievalService` core.

- deterministic embedding is 1536-dimensional and network-free;
- hosted implementation uses the pinned official OpenAI Python SDK;
- request fixes model=`text-embedding-3-small`, dimensions=1536, encoding_format=`float`;
- SDK retries are set to zero;
- wrong length, zero, non-finite and boolean vectors fail closed through existing vector validation;
- provider error details are collapsed to the repository retrieval error surface;
- cancellation is not converted to ordinary provider failure in the committed cancellation test.

Hosted `ready()` is configuration readiness only and deliberately does not call a billable external endpoint. Therefore S2 may not claim remote credential validity until an explicitly authorized real hosted run occurs.

**Embedding code review: PASS WITH EVIDENCE LIMITATION.**

## 4. FastAPI / PostgreSQL review

The new bootstrap composes the existing `RetrievalService`, `PostgresRepository` and embedding seam rather than replacing them. Missing/invalid configuration returns the existing unavailable service composition. Search remains configured at 2 seconds; ingestion uses a separate finite operator timeout.

The existing PostgreSQL repository remains the persistence path. The committed real-DB tests are designed to cover:

- readiness/profile/dimension/least-privilege checks;
- concurrent idempotent ingest;
- scope/status/version/profile isolation;
- actual INSERT rollback on failure and cancellation.

Those real PostgreSQL tests are currently reported as skipped locally because the disposable database environment was unavailable.

**Composition/repository code review: PASS, pending independent real-DB execution.**

## 5. Node composition review

The Node change adds a thin `enterpriseVectorRetrievalFactoryFromEnv()` and reuses:

- `FastApiRetrievalService`;
- `PostgresRagRegistry`;
- the existing application pool;
- existing Node canonical reconciliation.

`ENTERPRISE_RETRIEVAL_MODE` still defaults to `lexical`; vector is explicit opt-in. Private knowledge mode is rejected for this hosted S2 composition, and the frozen hosted profile/public-synthetic declaration is required.

No canonical-reconciliation or 0/1/2+ answerability implementation is modified in the reviewed diff.

**Node completion review: PASS.**

## 6. Existing CI change

The existing workflow is not redesigned. The implementation adds the new cross-language deterministic vector/PostgreSQL test to the already existing Python/PostgreSQL gate step after pinned Python test dependencies are installed.

This is considered focused Gate wiring, not CI architecture refactoring.

However, at review time commit `814f0565ef9b752b60e1eeead593d09696de69df` has no GitHub commit status/remote workflow evidence. Local implementer test results must not be relabeled as independent CI.

## 7. Current verdict / handoff

**READY FOR QODER INDEPENDENT DETERMINISTIC VERIFICATION.**

No core-code correction is required from this GitHub code review before Qoder verification.

S2 remains **NOT YET PASSED** because the following evidence is still outstanding:

1. independent deterministic verification on the exact implementation source;
2. real disposable PostgreSQL / cross-language path execution if the verification environment supports it;
3. remote CI/clean-runner evidence before final sprint freeze;
4. separately authorized hosted OpenAI embedding run on public/synthetic data if the user chooses to complete the real-semantic evidence class.

If Qoder finds an implementation failure, it must report a minimum reproduction and return the defect to Codex GPT-6 rather than editing the core implementation.
