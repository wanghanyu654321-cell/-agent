# S7 Badcases and Trade-offs V1

Status: **EVIDENCE-BACKED BADCASE RECORD — FOR INTERVIEW / ENGINEERING REVIEW**

Three observed badcases, each verified against repository evidence documents.
Historical failures keep their historical verdicts; nothing here relabels a past
failure as a later PASS. The comparison section at the end is a bounded
evidence/trade-off comparison, not the deferred S4 retrieval ablation.

## CASE 1 — Historical real-provider Runtime timeout-sensitive fallback

### Signal

In the final authorized durable real-provider run of PR #9 (`openai-codex` /
`gpt-5.6-sol`, `runtimeCaseAttempts = 3`, `retries = 0`), case
`A_SINGLE_EVIDENCE` reached both governed tools (`search_faq` and
`search_knowledge`) but completed as `fallback` with no authorized evidence at
approximately the 10-second overall deadline (elapsed 10003 ms). Contract
result: FAIL.

### Diagnosis

The single-evidence path worked: the governed tools were invoked and the
evidence path was reached. What failed was completion timing — the provider's
answer arrived around the overall timeout boundary, so already-verified
admissible evidence was discarded and the turn closed as fallback. This is a
narrow contract problem at the deadline boundary, not a retrieval, authority,
or Safety defect.

### Decision

The Independent Final Gate recorded the run outcome verbatim and concluded
**REJECTED** for `REAL-SOURCE RUNTIME PROOF V1`. The verdict was preserved; no
tuning, no timeout increase, and no rerun was used to chase a green result. The
recorded successor direction is narrow: already-verified admissible evidence
must not be incorrectly discarded merely because provider completion occurs
around an arbitrary overall timeout boundary, while preserving Safety
precedence, Evidence Governance, authority, and side-effect protections.

### Evidence

`docs/job-ready/CURRENT_STATE.md` (PR #9 closure state; Runtime reliability
badcase A; final authorized durable run table with the 10003 ms fallback row and
the REJECTED gate conclusion).

### Trade-off

Keeping the hard 10s budget and fail-closed fallback means a late-but-correct
provider answer is sometimes dropped. That is the deliberate cost of a bounded,
auditable runtime: no unbounded waits, no partial-evidence answers, no silent
authority expansion.

### What I would do next

Re-test this boundary only under a fresh bounded real-provider evidence contract
(the S3 class, currently DEFERRED), with instrumentation that separates
"evidence verified before deadline" from "answer completed after deadline", and
a fix scoped to admitting deadline-verified evidence without weakening
fail-closed behavior.

## CASE 2 — PostgreSQL least-privilege schema permission defect

### Signal

Clean-runner GitHub Actions run `34686326441` (job `independent-gate` /
`103533819351`) failed all three `test_s2_postgres.S2PostgresTests` cases
before any ingest/search work, with
`psycopg.errors.InsufficientPrivilege: permission denied for schema public`,
raised in `PostgresRepository.ready()` right after switching to role
`job_ready_rag_indexer`.

### Diagnosis

`migrations/004_job_ready_rag.sql` created the NOLOGIN RAG roles and granted
table-level privileges (`SELECT` on `rag_documents`; `SELECT,INSERT,DELETE` on
`rag_chunks`), but never granted `USAGE` on schema `public`, and the first
`005` draft did not add it either. Table grants without schema usage mean the
least-privilege role cannot resolve the schema-qualified relations at all.
Local verification had missed this because the local Windows environment had no
PostgreSQL/Docker runtime — the PostgreSQL tests were environment-skipped, not
green — and mock-based unit tests never exercise a real least-privilege role
switch. The real PostgreSQL clean runner executed the real role and caught it
immediately.

### Decision

Classified as **IMPLEMENTATION DEFECT CONFIRMED** — not environment, not flaky
CI, not a retrieval-architecture failure. The fix was the minimum explicit
schema permission inside migration `005_job_ready_rag_profiles.sql`:
`GRANT USAGE ON SCHEMA public TO job_ready_rag_indexer,
job_ready_rag_registry_writer`. Broadening privileges (business-table grants,
superuser, or role merges) was explicitly rejected; migrations `001–004`
remained untouched.

### Evidence

`docs/job-ready/evidence/S2_C1_CLEAN_RUNNER_FAILURE_V1.md` (full failure,
root-cause, classification, and fix-boundary record);
`docs/job-ready/evidence/S2_C1_ENVIRONMENT_BLOCKED_V1.md` (why local runs
skipped the path);
`migrations/005_job_ready_rag_profiles.sql` (the shipped minimal grant);
S6 clean-runner Run `34699201771` (PostgreSQL/Core B/Python RAG/vector E2E all
PASS on the fixed source).

### Trade-off

Least-privilege roles cost a class of defects that only real-database CI can
observe. The alternative — granting broad privileges or running the app as the
schema owner — would have made tests greener sooner while deleting the security
property the roles exist to prove.

### What I would do next

Keep treating "PostgreSQL tests skipped" as an open risk rather than a pass,
and prefer a disposable real-PostgreSQL step in CI for every migration/role
change, since this defect class is invisible to mocks by construction.

## CASE 3 — Hosted embedding HTTP 401 / credential block

### Signal

During the S2 hosted embedding evidence attempts, an actual provider request
reached the endpoint and returned HTTP 401 (invalid credential). The hosted
path could not produce authorized evidence.

### Diagnosis

The block is a missing valid hosted API credential — a prerequisite of the
evidence class, not an implementation defect: the deterministic 1536-profile
path through the same code passes end-to-end in CI, and mock-based provider
validation (model/dimension/encoding validation, zero SDK retries, malformed
output rejection, cancellation, error sanitization) passes independently. The
401 is recorded historical evidence and stays immutable.

### Decision

Zero-retry discipline was kept (no automatic retries); no timeout was raised; no
provider was swapped to turn the gate green. Final status remains verbatim:
**REAL HOSTED OPENAI EMBEDDING: BLOCKED — VALID API CREDENTIAL UNAVAILABLE.**
The separate Codex model-side verification (`S2_C2_CODEX_MODEL_VERIFICATION_V1.md`,
PASS) was recorded as exactly what it is — a bounded reasoning/grounding check
over public synthetic evidence — and explicitly not as hosted embedding
verification.

### Evidence

`docs/job-ready/evidence/JOB_SEARCH_SPRINT_V1_CLOSURE.md` (S2 claim B BLOCKED;
"recorded HTTP 401 failures from historical attempts" retained as immutable
evidence);
`docs/job-ready/evidence/S2_C2_CODEX_MODEL_VERIFICATION_V1.md` (hosted status
BLOCKED; separate model-side verification PASS with explicit exclusions);
`docs/job-ready/evidence/S2_INDEPENDENT_GATE_V1.md` (Condition C2 and the
mock-verified zero-retry/provider-validation boundary).

### Trade-off

Not retrying and not swapping providers means the sprint closes with an honest
BLOCKED instead of a manufactured green. The cost is no hosted semantic
embedding evidence in the portfolio; the benefit is that every PASS in the
evidence chain remains reproducible and untainted.

### What I would do next

Obtain a valid hosted credential, then execute the bounded hosted run exactly
as contracted in `REAL_RAG_S2_GATE_V1.md` section 10 (public/synthetic corpus
only, explicit dimensions=1536, recorded latency/failures, zero automatic
retries), before any retrieval-quality claim is even discussed.

## Bounded comparison report

The sprint contract mentions a comparison report, but the owner approved S4
deferral, so no retrieval ablation was run and no lexical/vector quality
numbers exist. The honest comparison available today is between evidence and
trade-off boundaries, not retrieval scores:

- **Lexical default vs explicit vector integration** — lexical is the default
  retrieval mode; vector composition is an explicit opt-in requiring full
  configuration. No mode ever silently switches after failure. (No quality
  ranking between the two is claimed; none was measured.)
- **Deterministic integration evidence vs hosted-provider evidence** — the
  deterministic 1536-profile path proves the migration/pgvector/FastAPI/Node
  plumbing works; it proves nothing about hosted provider behavior or semantic
  quality. These claim classes are kept separate (closure ledger, S2 A/B/C).
- **Answer vs fallback vs escalation** — the runtime chooses among three
  dispositions under governance: admitted single evidence → answer; zero or
  ambiguous evidence → fallback; safety trigger → escalation with higher
  precedence than the ordinary path.
- **Tool invocation vs durable read-back** — a model saying a ticket was
  created is not accepted; only the scoped PostgreSQL read-back through the
  authenticated session proves the business write.
- **Local environment evidence vs clean-runner evidence** — locally skipped
  PostgreSQL/Docker paths are recorded as skips, never as passes; the
  independent clean runner on the exact source tree supplies the missing
  coverage, and its run/job identity is recorded (S6: Run `34699201771` / Job
  `103567849816`).

No retrieval ablation (R0–R4, Hybrid/RRF, reranker) was executed, and this
report does not resurrect S4.
