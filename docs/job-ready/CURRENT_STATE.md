# Job-Ready Current State

Status: **PRE-ICP ENGINEERING BASELINE — CLOSED / FROZEN**

Current authoritative implementation source: `55182eb11e801b49a5c5564d05acc72207b249f1`
(tree `68499338168aed05353247ce5196503b7118bcf7`) from
`job-ready/thin-digital-employee-v1`. It closes Request Debugging (`e4a4c43`),
Durable Acceptance (`1ebbd37`), Thin Digital Employee / AgentProfile (`48748ef`),
and Pre-ICP Evaluation Governance Consolidation V1. Exact-source clean-runner
`35238937264` / job `105262039153` completed successfully.

The main-convergence operation preserves the frozen implementation semantics and
reconciles only main-facing documentation. Historical Job-Search Sprint V1 evidence
below remains immutable in meaning and continues to explain the predecessor baseline.
This Pre-ICP closure is not a production-readiness, hosted-provider,
retrieval-quality-acceptance, live-WeCom, Data-Flywheel, or MCP claim.

Current Pre-ICP closure state:

- Request Debugging: CLOSED.
- Durable Acceptance: CLOSED.
- Thin Digital Employee / AgentProfile: CLOSED.
- Evaluation Governance Consolidation V1: CLOSED.
- Container Delivery: CLOSED.
- Public HTTPS / ICP deployment: WAITING.
- Live WeCom wire integration: WAITING FOR DEPLOYMENT.
- Production Data Flywheel: WAITING FOR REAL TRAFFIC.
- Thin MCP: WAITING FOR FLYWHEEL.

The sprint closure ledger remains
`docs/job-ready/evidence/JOB_SEARCH_SPRINT_V1_CLOSURE.md`; it is historical
provenance, not the current implementation pointer.

## Historical Job-Search Sprint V1 checkpoint

- Branch: `job-search/sprint-v1`
- Final reconciled closure baseline commit: `0a2d0f723814eb787e079195dc4326a944c1fd76`
- Final reconciled closure baseline tree: `f11b7f4ebec16c60d84a4a53065b6b10d406fe80`
- Final clean-runner Gate: [34766236491](https://github.com/wanghanyu654321-cell/-agent/actions/runs/34766236491) /
  [103747586810](https://github.com/wanghanyu654321-cell/-agent/actions/runs/34766236491/job/103747586810),
  `Customer Support Agent Gate`, conclusion `success`.
- This checkpoint update changes only this file, the closure ledger above, and
  `docs/job-ready/evidence/S7_JOB_SEARCH_EVIDENCE_PACKAGE_V1.md`.
- Original S7-B evidence identity remains separate: `782ddddf4a0193ab2f056f50e0ab7b7cd70e08b6` /
  `3b8ad30c78717f2f97a06231c47e2f56d0755d35` / Run `34759070549` / Job `103728515129`.

Current sprint state in brief:

- Migrations `001`–`005` are present and immutable. `005_job_ready_rag_profiles.sql`
  binds `rag_chunks.embedding` to `vector(1536)`, replaces `gap03_profile_unresolved`
  with `rag_chunks_s2_profile` (allowing only `openai-text-embedding-3-small-1536-v1`
  and `deterministic-test-1536-v1`), and grants the required RAG schema usage.
- S1 Thin Evaluation Harness: CLOSED / PASS (independent review `APPROVED WITH
  CONDITIONS`; the clean-runner condition was subsequently covered by the S6 gate run).
- Deterministic 1536-vector / pgvector integration: PASS (migration 005 →
  `deterministic-test-1536-v1` → PostgreSQL → Python/FastAPI retrieval → Node
  `FastApiRetrievalService` → `PostgresRagRegistry` canonical reconciliation).
- Real PostgreSQL / cross-language integration: PASS (S6 clean-runner: PostgreSQL
  identity/business/application, Core A, Core B, Job-Ready gates; Python RAG 43/43;
  vector-postgres cross-language E2E 1/1).
- S6 Full Regression: CLOSED / PASS (`docs/job-ready/evidence/S6_FINAL_REGRESSION_V1.md`).
- Lexical retrieval remains the default; vector mode is explicit opt-in.
- Real hosted OpenAI embedding: BLOCKED — VALID API CREDENTIAL UNAVAILABLE. No
  hosted-provider PASS is claimed.
- GAP-05 retrieval quality acceptance: NOT CLAIMED.
- S3 (bounded real-provider Golden Path): DEFERRED — valid hosted-provider evidence
  prerequisite unavailable; not PASS, not completed.
- S4 (retrieval ablation / Hybrid / RRF): DEFERRED / NOT IMPLEMENTED / NOT CLAIMED
  (owner-approved scope decision).
- S5 reranker: NOT JUSTIFIED / NOT IMPLEMENTED.
- S7 deliverables: COMPLETE; S7-A deterministic demo: PASS WITH ENVIRONMENT
  LIMITATIONS (7/7 curated scenarios; local PostgreSQL/Docker journeys remain BLOCKED).
- S7-B evidence package: COMPLETE; final S7-B CI: PASS — Run `34759070549`,
  Job `103728515129`, conclusion `success`, bound to the final S7-B commit/tree above.
- Independent Final S7 Closure Review: APPROVED WITH CONDITIONS; both conditions
  are SATISFIED by integration of `0a2d0f7` into `job-search/sprint-v1` and the
  successful final clean-runner Gate on that exact commit/tree.
- Sprint state: CLOSED / FROZEN. Feature expansion is frozen for Job-Search Sprint V1.
  This sprint closure is not a production-readiness, hosted-provider, or retrieval-quality PASS.

## Current verified engineering capabilities

Truthfully supported by clean-runner evidence on the sprint source:

- One Pi-owned Agent Runtime with unchanged bounded budgets (max 4 Agent turns,
  max 6 tool calls, 10s total, 2s per tool, sequential tool execution).
- Node-owned authority: server-derived identity/membership, tenant/store scope,
  capabilities, Safety precedence, evidence authorization, and durable business writes.
- Safety vertical slice with fail-closed precedence; safety/robustness/holdout
  evaluation suites pass in CI.
- Governed FAQ/knowledge evidence admission and grounding with ordinary
  0 / 1 / 2+ answerability (0 admissible → fallback; exactly 1 canonical → answer
  eligible; 2+ → ambiguous/fallback).
- Durable PostgreSQL business boundary: Ticket/Handoff persistence, audit projection,
  once-only migration ledger through 005.
- Tenant/store isolation verified against PostgreSQL in CI.
- Deterministic lexical retrieval (default) plus explicit vector composition through
  the private FastAPI retrieval service and pgvector `vector(1536)` with Node canonical
  registry reconciliation.
- Same-origin React operations/demo application (StoreOps views mounted in the
  existing authenticated lifecycle).
- Local Docker delivery proof in CI: image build/start, application startup/auth/FAQ,
  scoped ticket read-back, isolation, retained-volume recreation, persistence.
- S1 thin evaluation harness (case/config → runner → existing service → evaluator →
  report) preserved outside production.

These capabilities are engineering/integration proofs. They are not production,
hosted-provider, or retrieval-quality claims.

## Current limitations / deferred scope

- REAL HOSTED OPENAI EMBEDDING: BLOCKED — VALID API CREDENTIAL UNAVAILABLE.
  Historical hosted failure/blocked evidence remains immutable; no hosted rerun is
  authorized.
- RETRIEVAL QUALITY ACCEPTANCE: NOT CLAIMED — GAP-05 unresolved. The public retrieval
  regression is not semantic/vector retrieval quality acceptance.
- S3 bounded real-provider Golden Path: DEFERRED (valid hosted-provider evidence
  prerequisite unavailable).
- S4 Hybrid/RRF and ablation benchmarks: NOT IMPLEMENTED / NOT CLAIMED.
- S5 reranker: NOT JUSTIFIED.
- Live WeCom wiring, public HTTPS/domain/Nginx hosting, MCP, full process-restart
  session continuity: deferred.
- Production readiness, customer deployment, Pilot success: NOT claimed.
- The local Windows environment cannot execute PostgreSQL/Docker paths; those paths
  are covered by the independent clean-runner evidence below.

## Current clean-runner evidence

Final reconciled closure baseline:

- Commit: `0a2d0f723814eb787e079195dc4326a944c1fd76`
- Tree: `f11b7f4ebec16c60d84a4a53065b6b10d406fe80`
- Workflow: Customer Support Agent Gate
- Run: [34766236491](https://github.com/wanghanyu654321-cell/-agent/actions/runs/34766236491)
- Job: [103747586810](https://github.com/wanghanyu654321-cell/-agent/actions/runs/34766236491/job/103747586810)
- Conclusion: `success`.
- Independent Final S7 Closure Review: APPROVED WITH CONDITIONS; review conditions:
  SATISFIED.

Original S7-B evidence identity (historical S7-B package, retained separately):

- Commit: `782ddddf4a0193ab2f056f50e0ab7b7cd70e08b6`
- Tree: `3b8ad30c78717f2f97a06231c47e2f56d0755d35`
- Workflow: Customer Support Agent Gate
- Run: [34759070549](https://github.com/wanghanyu654321-cell/-agent/actions/runs/34759070549)
- Job: [103728515129](https://github.com/wanghanyu654321-cell/-agent/actions/runs/34759070549/job/103728515129)
- Conclusion: `success` (final S7-B CI: PASS).

The S7-B run is bound to the historical S7-B evidence package; the final
clean-runner Gate above is bound to the reconciled closure baseline. Neither
evidence identity is replaced by this later docs-only status update.

Retained S6 full-regression evidence:

- Workflow: Customer Support Agent Gate
- Run: `34699201771`
- Job: `103567849816`
- Conclusion: success
- The CI checkout tree exactly equals the S6 baseline tree
  `061e69d17e2cc8600ca3912a2c48ebd6f98bd4a7` (see
  `docs/job-ready/evidence/S6_FINAL_REGRESSION_V1.md` for the full verified coverage
  list, including PostgreSQL, pgvector cross-language E2E, Python RAG, Docker
  persistence, build/check, and all eval suites).

Supplementary: the subsequent documentation-only push of the S6 evidence commit
triggered gate run `34743823040`, which also succeeded. This is supplementary only;
S6 historical evidence is not modified to chase CI.

## Historical record

Everything from here to the end of this file is the pre-sprint Job-Ready integration
baseline record (branch `job-ready/integration-v1` era), preserved unchanged in
meaning for traceability. Its status lines, integration checkpoints, GAP states, and
claim boundaries describe that historical baseline, not the current sprint state
above. The historical governance and PR #9 evidence remain unchanged in meaning. The
historical integration checkpoint was additive and did not turn historical failed
real-provider evidence into PASS.

### Integration checkpoint (historical — pre-sprint `job-ready/integration-v1`)

Branch: `job-ready/integration-v1`. Contract base:
`7c9b694d586fe4c557a195b554a97cc89e5c8f24`.

Exact reviewed source commits, cherry-picked in this order (original branches unchanged):

| Track | Reviewed source commits | Integration copies |
| --- | --- | --- |
| Core A | `7a42aaf9d96ac455cd5a3e433382176f89789ecd` | `4f51511` |
| Core B | `33b7a504a57a5af0bacc0d783617a55d4b477d4b`, `0f94a4b3a33164253ed56b47657bbbf768a3a55b` | `4c9394b`, `b8015ad` |
| Track C | `ad56005e7ef6d99a673701b249fd0a6a4fa7866a`, `b3cc02f0cd908b9b6a1c454b314a6e78065d369a` | `08377c0`, `bdb7a9f` |
| Track D | `5582c00155a0291ceadb79ebd16536b4ca743d12`, `a83e1dea8120831b44d42988e7dee60aa7776095` | `4fc86dc`, `d9827c0` |

### IMPLEMENTED

- Existing once-only transaction ledger registers 001 → 002 → 003 → 004; frozen SQL files unchanged.
- Existing StoreOps repository/service and exact HTTP contracts composed through server-derived authority; Track C mounted in the existing authenticated React lifecycle.
- Approved private entries register through Core B's bounded Node registry; Knowledge view is scoped active/approved metadata only. No synthetic portfolio admission into that registry.
- Enterprise runtime factory accepts the reviewed retrieval adapter through the existing RetrievalService boundary. Lexical remains default; environment vector mode fails closed pending GAP-03/04. No new Agent loop or synchronous selector.
- PostgreSQL remains major 16; private FastAPI/Python image and pgvector 0.8.0 image are digest-pinned. Minimal driver `psycopg[binary]==3.2.10` added for actual PostgreSQL verification.
- Legacy evaluators distinguish policy operations/audit from genuine Pi events. Safety hard negatives retain the ordinary-path label `normal` while separately recording actual `runtimeResultType=fallback`; unsupported ordinary answers are not accepted.
- Current eval outputs use an external `JOB_READY_EVAL_REPORT_ROOT` in CI; immutable historical reports, corpus, gold and failed attempts are not overwritten.

### TESTED locally

- `npm test`: 572 passed / 37 skipped / 0 failed (609 total); build, check, integrity PASS. Job-Ready focused suite: 226 passed / 16 skipped / 0 failed. Python: 30 passed / 1 skipped / 0 failed. Skips are database gates, not successful database evidence.
- New regression: policy evidence A + different Pi lookup B still in flight at overall deadline → fallback, empty authorized evidence/audit; late B cannot resurrect A. Existing Core A Runtime passes without an integration edit to `src/index.ts`.
- Node/TypeScript deterministic composition, StoreOps HTTP authority, Track C mount, adapter injection, and policy-vs-Pi event negative controls.
- Safety 30/30, robustness 100/100, holdout 60/60, governed Knowledge 46/46; synthetic retrieval 4 cases and public retrieval/runtime 62 cases pass existing gates. Public Top-1 remains 96%, Recall@3 100%, routed outcome accuracy 100%.
- Local PostgreSQL integration tests are SKIPPED because no disposable local database is configured. Local Docker is unavailable. Those are not PASS evidence.

### CLEAN-RUNNER evidence

First integration run `34080606896`, job `101615027391`, source
`c69697078f8b1ff70ec920a0c3d10884d0c23e9f` failed in the old PostgreSQL application
suite (8 passed / 2 failed / 0 skipped). Both failures were exact operation-list
expectations omitting Core A's policy lookup, including the persisted audit list.
Fresh/repeat migration, identity, authority, isolation and shutdown tests passed.
Only those two operation expectations are corrected; fallback/evidence, durable
business and audit privacy assertions remain intact. The failed CI is retained.

Core A/B dedicated database gates, composed StoreOps HTTP, Python live-driver and
Docker smoke were not reached in that failed run.

Fresh successful run: [34080970418](https://github.com/wanghanyu654321-cell/-agent/actions/runs/34080970418),
job `101616028010`, push source and actual checkout
`9371b9de3628ad1fcec0c11c96566f42227cfcc0`, tree
`414d0bc54a17ed191837b819ed94131e5b59c39e`. No PR merge-ref is involved.

| Gate | Passed | Skipped | Failed |
| --- | ---: | ---: | ---: |
| General Node suite | 572 | 37 | 0 |
| Job-Ready focused Node/web/eval suite (overlapping subset) | 226 | 16 | 0 |
| PostgreSQL Identity | 6 | 0 | 0 |
| PostgreSQL Business | 5 | 0 | 0 |
| PostgreSQL Application | 10 | 0 | 0 |
| Core A PostgreSQL StoreOps/WeCom | 13 | 0 | 0 |
| Core B PostgreSQL/pgvector registry | 1 | 0 | 0 |
| Composed Job-Ready HTTP/PostgreSQL | 2 | 0 | 0 |
| Python including actual PostgreSQL driver | 31 | 0 | 0 |

The 37 general-suite database skips execute separately in the mandatory database
steps above. Core A proves scope/FKs, CAS, intent idempotency, dedupe, concurrency,
rollback and delivery uncertainty. Core B proves registry immutability/retirement,
cross-store filtering, privileges and the still-active `gap03_profile_unresolved`
constraint. Composed HTTP tests prove server authority and active/approved
registry metadata without body exposure. No SQL mocks substitute for these gates.

Lockfile install, build, check, integrity and all six legacy eval steps PASS.
Docker image builds, application startup/auth/FAQ, scoped ticket read-back,
Bob isolation, retained-volume recreation, ticket and safe Audit persistence PASS.
Private FastAPI auth returns 401 without credential and bounded
`retrieval_unavailable`/503 with the disposable CI credential: the unresolved
profile is not mislabeled as vector readiness.

This state update is documentation-only after that tested source. The final pushed
documentation commit must also receive its own complete clean-runner; its exact
run/source will be supplied to the independent reviewer, without another source
change after verification.

### NOT TESTED / NOT CLAIMED

Real embedding/vector quality, live WeCom, external provider re-evaluation,
hosted HTTPS and customer/Pilot deployment. Local PG/Docker remain unavailable;
only the actual isolated clean-runner supplies that evidence. CI warns about the
upstream actions' Node runtime deprecation; action modernization is not part of
this bounded integration.

### BLOCKED BY CONTRACT GAP

- GAP-01: live WeCom protocol/crypto.
- GAP-02: external customer identity binding; no invented staff mapping.
- GAP-03: embedding model/revision/dimension/location/egress; `gap03_profile_unresolved` guard retained.
- GAP-04: vector relevance floor; no guessed floor or lexical fallback.
- GAP-05: retrieval quality thresholds; no manufactured quality PASS.
- Frozen `RetrievalMeasurement` has no returned sourceRefs. Core B Node sourceRef reconciliation remains tested; Track D's measurement gap is explicitly unresolved.

FastAPI's default engine therefore remains authenticated-but-unavailable (503),
not production vector-ready. PostgreSQL schema/privilege/guard proof is separate
from real embedding or vector retrieval capability.

### OUT OF SCOPE / NOT AUTHORIZED

Real provider/embedding calls (both 0), live WeCom, hosted/customer/Pilot success,
production readiness, new product features, merge/tag/release/Ready, PR creation,
and PR #9 mutation. Await Independent Final Integration Gate after evidence closure.

## 1. Authoritative predecessor

Repository:

`wanghanyu654321-cell/-agent`

Authoritative predecessor source HEAD for this governance baseline:

`e315073bfdc0de980d7689193bf88d62766e02d5`

Source tree:

`992008594d88a84aa0037e3cf615b37383fcf996`

That source is the PR #9 head for:

`fix/real-source-runtime-evidence-durability-v1`

PR #9 remains a proof-evidence branch and must not be reused as the implementation branch for the Job-Ready successor.

## 2. PR #9 closure state

### Real-Source Runtime Evidence Durability V1

**APPROVED** at source HEAD `e315073bfdc0de980d7689193bf88d62766e02d5`.

The independent Gate verified the fresh external write-once/fsync journal boundary, bounded safe evidence projection, focused durability tests, clean-runner regression evidence, PostgreSQL gates, Safety/Knowledge/Retrieval gates and Docker persistence smoke.

PR #9 independent durability review comment:

`5549632831`

### Final authorized durable real-provider run

Exactly one newly authorized real-provider A/B/C run was completed on the same exact source HEAD with:

- provider/model: `openai-codex / gpt-5.6-sol`;
- `runtimeCaseAttempts = 3`;
- `retries = 0`;
- 8 complete newline-terminated durable journal records;
- `run_completed` present;
- `allThreeCasesPassed = false`.

Safe evidence was published in PR #9 comment:

`5550543622`

Observed case outcomes:

| Case | Actual result | Tools | Authorized evidence | Elapsed | Contract result |
| --- | --- | --- | --- | ---: | --- |
| `A_SINGLE_EVIDENCE` | fallback | `search_faq`, `search_knowledge` | none | 10003 ms | FAIL |
| `B_ZERO_EVIDENCE` | fallback | `search_faq` | none | 7854 ms | FAIL |
| `C_AMBIGUOUS_EVIDENCE` | fallback | `search_faq`, `search_knowledge` | none | 10000 ms | PASS |

Independent Final Gate conclusion for `REAL-SOURCE RUNTIME PROOF V1`:

**REJECTED**.

This rejection applies to the real-source Runtime Proof acceptance contract, not to the already-approved Evidence Durability implementation.

No additional PR #9 A/B/C provider rerun is authorized.

## 3. Recorded Runtime reliability badcases

The final durable run produced two distinct successor engineering signals.

### Badcase A — timeout-sensitive final fallback

`A_SINGLE_EVIDENCE` actually reached both `search_faq` and `search_knowledge` but completed as fallback with no authorized evidence at approximately the existing 10-second overall deadline.

The successor may investigate and repair only the narrow contract problem: already verified admissible evidence must not be incorrectly discarded merely because provider completion occurs around an arbitrary overall timeout boundary.

This must preserve Safety precedence, Evidence Governance, authority and side-effect protections.

### Badcase B — governed knowledge path not reliably reached

`B_ZERO_EVIDENCE` correctly returned fallback but called only `search_faq`; the frozen proof contract required `search_knowledge` to be exercised as the governed ordinary knowledge path.

The successor may make that governed routing/check deterministic where the product contract requires it rather than leaving it to opportunistic model tool selection.

The purpose is reliability, not benchmark gaming.

## 4. Existing high-value capabilities to preserve

The successor starts with substantial approved/frozen engineering evidence already present in the repository, including:

- one Pi-owned Agent Runtime;
- Safety vertical slice and robustness/holdout evaluation;
- governed FAQ/knowledge Evidence admission and grounding;
- tenant/store isolation;
- server-derived identity, roles and capabilities;
- enterprise execution context;
- durable PostgreSQL business boundary;
- Ticket/Handoff persistence and audit projection;
- same-origin React application delivery;
- local Docker + PostgreSQL restart-persistence proof;
- deterministic and real-source retrieval evaluation infrastructure;
- real Pi provider adapter;
- private store knowledge composition;
- bounded real-source runtime proof/evidence harness;
- durability evidence for interrupted external-provider proof execution.

Do not rebuild these capabilities under new names.

## 5. Remaining Job-Ready gaps

The final successor is intentionally limited to the following gaps:

1. **Runtime Reliability Closure**
   - deterministic closure of Badcase A and B without weakening existing governance;
2. **Enterprise WeChat text integration**
   - official channel ingress/egress, callback security, idempotency and internal identity binding;
3. **Thin StoreOps workflow**
   - Knowledge, simple Availability, Booking Intent and Manager Handoff/Needs Attention;
4. **Python/FastAPI + practical RAG**
   - thin retrieval service, pgvector, tenant/store/status metadata filtering and Node Evidence Governance integration;
5. **React StoreOps increment**
   - bounded operational/demo views on top of the existing React application;
6. **Hosted deployment**
   - Linux + domain/HTTPS + Nginx + Docker Compose + Node/FastAPI/PostgreSQL+pgvector;
7. **Job-ready evaluation/troubleshooting evidence**
   - bounded RAG evaluation, structured latency/error evidence, deployment smoke and real incident/runbook evidence where actually observed.

No additional product domain is required for the current job-search objective.

## 6. Explicitly not required before Job-Ready Gate

The following are not blockers and remain out of scope unless explicitly reauthorized:

- ASR;
- full CRM;
- membership/stored value/cashiering/inventory;
- full scheduling/workforce management;
- full booking/payment engine;
- Meituan/Douyin real-time integrations;
- Multi-Agent;
- MCP;
- Redis/Kafka;
- Kubernetes;
- GraphRAG or complex reranking;
- large observability platform.

## 7. Historical governance sequence

The original governance sequence was (current execution is at shared integration):

```text
1. Governance baseline
   - AGENTS.md
   - this CURRENT_STATE.md
   - JOB_READY_PARALLEL_EXECUTION_DIRECTIVE.md

2. Independent Governance Gate

3. GPT-6 Task 0
   - create docs/job-ready/ARCHITECTURE_CONTRACT.md

4. Independent Contract Gate

5. Parallel implementation
   - GPT-6 Core A: Runtime Reliability + WeCom + StoreOps
   - GPT-6 Core B: FastAPI + RAG
   - Qoder Peripheral C: React StoreOps
   - Qoder Peripheral D: Eval / Deployment Support / Docs

6. GPT-6 shared-file integration

7. Full regression / integration / deployment evidence

8. Independent Job-Ready Final Gate
```

## 8. Claim boundary at the pre-sprint integration baseline (historical)

At this checkpoint the repository may truthfully claim the already-approved historical portfolio/enterprise/delivery/evaluation capabilities recorded in existing governed documents.

It must NOT yet claim:

- a successful real-source Runtime Proof V1;
- production readiness;
- a real hosted customer deployment;
- a real beauty-store Pilot;
- Enterprise WeChat integration;
- FastAPI/RAG production integration;
- pgvector production retrieval;
- autonomous customer replies.

Those claims require successor implementation plus independent evidence.
