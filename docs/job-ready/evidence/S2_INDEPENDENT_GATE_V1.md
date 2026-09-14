# S2 Vector Retrieval — Independent Gate V1

Status: **APPROVED WITH CONDITIONS**

Reviewed implementation:

- branch: `job-search/sprint-v1`
- implementation commit: `814f0565ef9b752b60e1eeead593d09696de69df`
- implementation tree: `8f2f442e32723ffec11aa2c81b0b395bb5fe6f07`
- implementation parent / completion-first baseline: `0a34396de48657a05540cbce897afd36bd39c87a`
- code-review checkpoint: `docs/job-ready/evidence/S2_IMPLEMENTATION_REVIEW_CHECKPOINT_V1.md`
- governing decision: `docs/job-ready/S2_REAL_RAG_DECISION_V1.md`
- governing gate: `docs/job-ready/evidence/REAL_RAG_S2_GATE_V1.md`
- completion-first addendum: `docs/job-ready/S2_COMPLETION_FIRST_ADDENDUM_V1.md`

This verdict combines the prior GitHub-side code review with an independent local verification packet executed on the exact implementation commit/tree. It does not relabel missing PostgreSQL or hosted-provider execution as PASS.

## 1. Independent source binding

Independent verification reported:

- exact commit/tree matched the reviewed implementation;
- working tree was clean before and after verification;
- Windows 11 / Node 24.18.0 / Python 3.11.15;
- no code, dependency, workflow, timeout or assertion changes were made by the verifier.

**Source binding: PASS.**

## 2. Completion-first / architecture result

The reviewed diff remains a completion patch, not a RAG rewrite:

- migrations 001-004 unchanged;
- successor 005 only;
- existing Python `Embedding`, `Repository`, `RetrievalService` seams reused;
- existing `PostgresRepository` reused;
- existing `FastApiRetrievalService` and `PostgresRagRegistry` reused;
- Node adds only a thin vector composition seam;
- lexical remains default;
- no Hybrid, RRF, reranker, ANN, DI framework, second Agent runtime or lexical rewrite.

**Completion-first architecture: PASS.**

## 3. Independent deterministic verification

Independent local execution on the bound implementation reported:

- S2 Python focused tests: 8 passed;
- full Python suite: 38 passed, 1 environment skip;
- `pip check`: PASS;
- Node composition/vector composition focused tests: 5 passed;
- Job-Ready RAG + integration + Harness group: 85 passed, 4 skipped;
- `npm run check`: PASS;
- `npm run build`: PASS;
- full Node regression: 601 passed, 1 environment failure, 38 skipped.

The single reproducible Node failure was `tests/integrity-gate.test.ts` invoking `git rev-parse` without a safe-directory override under a repository owned by another Windows SID. This is classified as **ENVIRONMENT**, not an S2 implementation regression. The verifier did not modify the integrity script or repository trust settings to force a green result.

No unexpected real OpenAI call was observed.

**Independent deterministic non-DB verification: PASS.**

## 4. Protected-contract result

Independent verification observed no change to:

- lexical default;
- Runtime limits;
- 0/1/2+ answerability;
- migrations 001-004;
- Pi pins;
- Safety precedence;
- Ticket/Handoff semantics.

The reviewed GitHub diff independently agrees with these observations.

**Protected contracts: PASS.**

## 5. PostgreSQL / cross-language evidence condition

The required disposable PostgreSQL / pgvector execution was **NOT EXECUTED — ENVIRONMENT UNAVAILABLE**.

Reported reasons:

- `POSTGRES_RAG_TEST_URL` was not configured;
- `psycopg` was unavailable in the verifier environment;
- PostgreSQL-backed Node and Python tests therefore remained skipped/not executed.

This means the following remain unproven by independent execution on the S2 implementation:

- fresh 001->005 migration application against real PostgreSQL/pgvector;
- actual `vector(1536)` database enforcement;
- actual profile constraint enforcement;
- transactional chunk INSERT / rollback / cancellation behavior;
- real `already_indexed` behavior against PostgreSQL;
- actual Python HTTP -> PostgreSQL -> Node canonical reconciliation path.

The code and tests for these paths were reviewed and are structurally consistent with the Gate, but the Gate explicitly forbids treating unexecuted DB tests as PASS.

**Condition C1 — REQUIRED BEFORE UNCONDITIONAL S2 PASS:** execute the disposable PostgreSQL/pgvector deterministic path on this exact implementation source, or on a descendant containing documentation only, with exact source/tree binding and no code changes.

## 6. Hosted embedding evidence condition

The OpenAI hosted embedding implementation has independent mock-based validation for:

- model `text-embedding-3-small`;
- explicit `dimensions=1536`;
- float encoding;
- zero SDK retries;
- wrong dimension / zero / nonfinite / boolean vector rejection;
- cancellation propagation;
- provider-error sanitization.

No paid hosted embedding call was executed, by design.

Therefore this Gate does not claim:

- remote API-key validity;
- actual hosted request success;
- actual returned model identity from a live call;
- hosted embedding latency/cost;
- real semantic retrieval execution.

**Condition C2 — REQUIRED BEFORE CLAIMING THE REAL-SEMANTIC S2 EVIDENCE CLASS:** after explicit user approval of the external call/budget, execute the bounded hosted embedding path on public/synthetic data only and retain the evidence packet required by `REAL_RAG_S2_GATE_V1.md`.

C2 is not a code defect and does not authorize private-corpus egress.

## 7. CI / clean-runner condition

The reviewed implementation commit has no remote GitHub commit status/workflow evidence. Local Codex and independent Qoder execution must not be relabeled as GitHub clean-runner evidence.

The S1 review already carried a final-sprint clean-runner condition; that remains outstanding for the final sprint freeze.

**Condition C3 — REQUIRED BY FINAL SPRINT GATE:** obtain exact-source remote/clean-runner evidence for the integrated final source. This does not require CI redesign.

## 8. Verdict

**APPROVED WITH CONDITIONS**

Rationale:

- no rejection condition in `REAL_RAG_S2_GATE_V1.md` was observed;
- completion-first scope is respected;
- non-DB deterministic implementation and regression evidence independently pass;
- remaining issues are evidence gaps, not demonstrated implementation defects;
- however, unconditional `APPROVED` would be false because the Gate requires real PostgreSQL/pgvector execution and the real-semantic path is not yet executed.

### Progression rule

Do **not** claim S2 `PASS` or "real hosted vector RAG executed" yet.

Before progressing to a stage that assumes real vector retrieval is independently runnable, satisfy **C1** first.

After C1 passes, architecture work does not need to return to Codex unless the DB execution exposes a real defect. Low-risk environment/test execution should remain with Qoder. Any core defect discovered by C1 returns to Codex GPT-6 with a minimum reproduction.

C2 can be executed separately after explicit user authorization and should remain bounded to public/synthetic data.
