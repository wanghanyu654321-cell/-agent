# Job Search Sprint V1 — Closure Ledger

Status: **JOB-SEARCH SPRINT V1 — CLOSED / FROZEN**

This ledger reconciles the original sprint plan (`docs/job-ready/JOB_SEARCH_SPRINT_V1.md`), the subsequent owner-approved decisions, and the actual repository evidence into one truthful final sprint state. It records the already-executed S7-A and S7-B plus the final clean-runner closure baseline; it authorizes no new implementation, provider call, CI rerun, or S7 repeat.

## Source identity

The final reconciled closure baseline is:

- Repository: `wanghanyu654321-cell/-agent`
- Source branch: `job-search/sprint-v1`
- Commit: `0a2d0f723814eb787e079195dc4326a944c1fd76`
- Tree: `f11b7f4ebec16c60d84a4a53065b6b10d406fe80`
- GitHub Actions run: [34766236491](https://github.com/wanghanyu654321-cell/-agent/actions/runs/34766236491)
- Job: [103747586810](https://github.com/wanghanyu654321-cell/-agent/actions/runs/34766236491/job/103747586810)
- Workflow: `Customer Support Agent Gate`; conclusion: `success` (PASS).
- Independent Final S7 Closure Review: **APPROVED WITH CONDITIONS**.
- Review conditions: **SATISFIED** — `0a2d0f7` is integrated into
  `job-search/sprint-v1`, and the final clean-runner Gate passed on that exact
  commit/tree.

Original S7-B evidence identity (historical evidence package, not replaced by
the final reconciled closure baseline):

- S7-B commit: `782ddddf4a0193ab2f056f50e0ab7b7cd70e08b6`
- S7-B tree: `3b8ad30c78717f2f97a06231c47e2f56d0755d35`
- S7-B GitHub Actions run: [34759070549](https://github.com/wanghanyu654321-cell/-agent/actions/runs/34759070549)
- S7-B Job: [103728515129](https://github.com/wanghanyu654321-cell/-agent/actions/runs/34759070549/job/103728515129)
- Workflow: `Customer Support Agent Gate`; conclusion: `success` (PASS).

This reconciliation changes only `docs/job-ready/CURRENT_STATE.md`, this ledger,
and `docs/job-ready/evidence/S7_JOB_SEARCH_EVIDENCE_PACKAGE_V1.md`. The final
clean-runner Gate is evidence for the final reconciled closure baseline, not for
this later documentation-only status update.

### Original pre-S7 reconciliation provenance (historical)

The exact source used for the earlier docs-only plan reconciliation:

- Repository: `wanghanyu654321-cell/-agent`
- Branch: `job-search/sprint-v1`
- Source commit: `bb39db708613353bf418f4e38b28adbf6597e2bb`
- Source tree: `c8051ea3c9448e05f9f435a04af5eb8dc214908e`
- Working tree at task start: clean
- Remote `origin/job-search/sprint-v1` at task start: `bb39db708613353bf418f4e38b28adbf6597e2bb` (aligned, no newer commits)

The only files changed by that earlier reconciliation were `docs/job-ready/CURRENT_STATE.md` and this file.

## Closure principle

This sprint is judged completion-first, not by framework or feature count.

- A capability may be claimed only when reproducible evidence directly supports it.
- Deferred work is not silently converted to PASS.
- Historical failures keep their historical evidence; nothing in this ledger rewrites them.
- The sprint value is a truthful, reproducible proof chain for the smallest credible AI Application Engineer / FDE evidence surface, not technology-name coverage.

## Phase ledger

| Phase | Original objective | Final status | Evidence | Remaining limitation / reason |
| --- | --- | --- | --- | --- |
| S0 Baseline and freeze | Freeze sprint scope, S1–S7 execution order, measurement identity rules | CLOSED | `docs/job-ready/JOB_SEARCH_SPRINT_V1.md`; `docs/job-ready/evidence/HARNESS_S1_GATE_V1.md` | None |
| S1 Thin Evaluation Harness | Minimal case/config → runner → existing service → evaluator → report layer with mandatory integrity negative controls | CLOSED / PASS | `docs/job-ready/evidence/HARNESS_S1_INDEPENDENT_REVIEW_V1.md` (APPROVED WITH CONDITIONS); clean-runner coverage delivered by S6 Run `34699201771` | Harness is evaluation infrastructure only; production code must not depend on it; it is not a replay platform, dashboard, scheduler, trace database, or generic framework |
| S2 (A) Engineering: deterministic vector/pgvector/FastAPI/Node integration | Real vector retrieval execution path: migration 005, pgvector `vector(1536)`, deterministic CI embedding profile, Node canonical reconciliation | PASS | `docs/job-ready/evidence/S2_INDEPENDENT_GATE_V1.md`; S6 clean-runner Run `34699201771` (Python RAG 43/43, vector-postgres cross-language E2E 1/1, PostgreSQL identity/business/application, Core A, Core B, Job-Ready gates all PASS) | Deterministic profile `deterministic-test-1536-v1` proves integration correctness only, not semantic retrieval quality |
| S2 (B) Real hosted semantic embedding-provider proof | `openai-text-embedding-3-small-1536-v1` manual evidence run on public/synthetic data only | BLOCKED — VALID API CREDENTIAL UNAVAILABLE | `docs/job-ready/evidence/S2_C2_CODEX_MODEL_VERIFICATION_V1.md` (hosted status BLOCKED; separate model-side verification PASS); `docs/job-ready/evidence/S6_FINAL_REGRESSION_V1.md` limitations retained | A valid hosted API credential prerequisite is unavailable; historical hosted failure/blocked evidence remains immutable; no hosted rerun is authorized by this ledger |
| S2 (C) Retrieval-quality acceptance | Approved quality thresholds plus calibration/final split before held-out evaluation | NOT CLAIMED — GAP-05 unresolved | GAP-05 remains open in the governed contracts; `S6_FINAL_REGRESSION_V1.md` limitations retained verbatim | Approved acceptance thresholds do not exist; no measured percentage is labelled overall retrieval-quality PASS |
| S3 Bounded real-provider Golden Path | Fresh source commit, new bounded provider-evidence contract, zero automatic retries, fixed case/token/cost ceiling | DEFERRED | No S3 execution exists; deferred status recorded here | Valid hosted-provider evidence prerequisite unavailable; S3 is not PASS and not completed; no provider rerun or call is authorized |
| S4 Retrieval ablation (R0–R4 incl. Hybrid/RRF) | One-factor-at-a-time retrieval comparison preserving answerability/Safety contract | DEFERRED / NOT IMPLEMENTED / NOT CLAIMED | Owner-approved scope decision recorded here; no ablation benchmark, merge strategy, retrieval selector, or hybrid/RRF implementation exists | Deliberate deferral, not a failure; meaningful comparison requires the real hosted provider evidence class that remains blocked |
| S5 Optional reranker | Only when R0–R4 show a concrete reason within the unchanged runtime budget | NOT JUSTIFIED / NOT IMPLEMENTED | No R0–R4 evidence exists that would justify a reranker | No measured reason; no empty adapter was built for resume keyword coverage |
| S6 Full regression and existing CI | Run the complete existing Gate on the exact final source without redesigning CI | CLOSED / PASS | `docs/job-ready/evidence/S6_FINAL_REGRESSION_V1.md` — Workflow `Customer Support Agent Gate`, Run `34699201771`, Job `103567849816`; CI tree exactly equals the S6 baseline tree `061e69d17e2cc8600ca3912a2c48ebd6f98bd4a7` | Limitations in that file retained verbatim: real hosted OpenAI embedding BLOCKED; retrieval quality acceptance NOT CLAIMED |
| S7 Job-search evidence package and freeze | Reproducible comparison report, exact commit/tree CI evidence, 3–5 minute demonstration, one-page explanation, observed badcases | CLOSED / FROZEN | `S7_JOB_SEARCH_EVIDENCE_PACKAGE_V1.md`; `S7_ENGINEERING_EXPLANATION_V1.md`; `S7_BADCASES_AND_TRADEOFFS_V1.md`; original S7-B Run `34759070549` / Job `103728515129`; final reconciled closure Run `34766236491` / Job `103747586810`, conclusion `success` | S7-A: PASS WITH ENVIRONMENT LIMITATIONS; S7-B package: COMPLETE; Independent Final S7 Closure Review: APPROVED WITH CONDITIONS, conditions SATISFIED. Sprint closure freezes feature expansion; it does not alter blocked/deferred/not-claimed boundaries or establish production readiness |

### S7 completion and final closure record

- S7 deliverables: COMPLETE; S7-B evidence package: COMPLETE.
- S7-A deterministic demo: PASS WITH ENVIRONMENT LIMITATIONS — 7/7 curated
  scenarios passed in the recorded local run. Local PostgreSQL/Docker journeys
  J1–J6 remain BLOCKED; the existing S6 clean-runner proof is separate evidence.
- Original S7-B CI: PASS on `782dddd` / `3b8ad30` / Run `34759070549` /
  Job `103728515129`; it remains the historical S7-B evidence identity.
- Final reconciled closure Gate: PASS on `0a2d0f7` / `f11b7f4` / Run
  `34766236491` / Job `103747586810`, conclusion `success`.
- Independent Final S7 Closure Review: APPROVED WITH CONDITIONS; both review
  conditions are SATISFIED by the authoritative branch integration and the exact
  final clean-runner Gate above.
- The bounded comparison explains evidence and trade-offs; it is not S4 retrieval
  ablation or retrieval-quality acceptance.
- Sprint state: CLOSED / FROZEN. This is a sprint-only closure and does not claim
  production readiness, hosted-provider availability, or retrieval-quality acceptance.
- Feature expansion is FROZEN for Job-Search Sprint V1. No S7 repeat, Request
  Debugging Closure, observability, or new Harness/evaluation work starts here.

### S2 claim separation (explicit)

S2 produced three distinct claim classes that must never be conflated:

- **(A) Deterministic vector/pgvector/FastAPI/Node integration proof — PASS.** Clean-runner evidence covers the full deterministic path: migration 005 → pgvector `vector(1536)` → `deterministic-test-1536-v1` → PostgreSQL → Python/FastAPI retrieval → Node `FastApiRetrievalService` → `PostgresRagRegistry` canonical reconciliation.
- **(B) Real hosted semantic embedding-provider proof — BLOCKED (VALID API CREDENTIAL UNAVAILABLE).** Historical hosted attempts and their failure/blocked evidence remain immutable. The Codex model-side verification (`S2_C2_CODEX_MODEL_VERIFICATION_V1.md`) is a separate bounded reasoning/grounding check over public synthetic evidence; it is explicitly not OpenAI Embeddings API verification, not hosted embedding verification, not vector semantic quality proof, and not a replacement for the blocked hosted run.
- **(C) Retrieval-quality acceptance — NOT CLAIMED.** GAP-05 is unresolved; no approved thresholds exist.

## Deliberate deferrals

The following scope was deliberately deferred by owner-approved decisions. These deferrals are scope decisions, not failures, and none of them negates the verified core engineering proof (S2 claim A) or the S6 regression closure:

- **Hybrid/RRF retrieval: deliberately deferred.** No merge strategy, retrieval selector, or ablation benchmark was implemented, and none is implied by this closure.
- **Reranker: not justified.** R0–R4 comparisons were not run, so no concrete reason exists to test one; no empty adapter was added.
- **Live WeCom protocol/crypto/customer identity wiring: deferred.** GAP-01/GAP-02 remain unresolved by decision.
- **Full process-restart session continuity: deferred.** PostgreSQL stores business records and a Pi session reference, not full Pi conversation recovery.
- **Public HTTPS/domain/Nginx hosted deployment: deferred.**
- **MCP: deferred.**
- **Production-readiness claim: out of scope.** Not claimed.

## Architecture closure

This project intentionally keeps a small number of high-cohesion boundaries instead of excessive modularization. The system remains composable and locally replaceable at meaningful seams, without building abstractions merely for future possibility.

Meaningful seams that exist today:

- React/UI → HTTP/Auth/ExecutionContext → EnterpriseSupportService → SupportAgentRuntime / Pi → Tools / Retrieval / Business Services → PostgreSQL.
- Evaluation Harness → existing Enterprise support contract. The Harness observes and evaluates the existing service/Runtime boundary; no production path imports the Harness.
- Retrieval seam: Node RetrievalService → lexical (default) OR explicit FastAPI/vector composition. Vector mode is an explicit opt-in; lexical remains default; retrieval failures never silently switch implementations.

This closure does not claim that every implementation is generically swappable.

The protected architecture is unchanged at closure:

- one Pi-owned Agent Runtime (Pi packages pinned at exactly `0.84.3`);
- Node owns identity/membership, tenant/store scope, capabilities, Safety, evidence authorization, and business authority;
- PostgreSQL is the durable business source of truth; pgvector extends it for retrieval and does not become a second authority system;
- FastAPI is a private retrieval service, not a second public application backend;
- React is a client/operations/demo surface, not an authority source;
- ranking never authorizes answers; retrieval produces candidate evidence only;
- 0 admissible candidates → fallback; exactly 1 canonical → answer eligible; 2+ → ambiguous/fallback;
- Safety fails closed;
- max 4 Agent turns; max 6 tool calls; 10s total budget; 2s per-tool budget; sequential tool execution;
- lexical default retrieval; vector explicit;
- pgvector dimension 1536; migrations 001–005 immutable;
- Ticket/Handoff durable boundaries preserved;
- historical evidence immutable.

No technology outside the protected contract list was added: no LangGraph, no second Agent loop, no Multi-Agent, no Redis, no Kafka, no Kubernetes, no GraphRAG, no MCP, no live WeCom, no Hybrid/RRF, no reranker, no Answerability V2, no new product feature, no new UI, no new showcase, no new DI framework, no generic provider abstraction.

## Evidence boundaries

- Deterministic integration evidence is not hosted-provider evidence.
- Hosted provider availability is not retrieval quality.
- Ranking quality is not answer authorization.
- Model text saying an action succeeded is not durable business success.
- Historical provider failures and blocked hosted attempts (including recorded HTTP 401 failures from historical attempts) remain immutable evidence and are not rewritten by this closure.

## Final closure record

S7-A and S7-B have already been executed. The Independent Final S7 Closure Review
is **APPROVED WITH CONDITIONS**, and both conditions are **SATISFIED** by the
authoritative branch integration of `0a2d0f7` and the exact final clean-runner
Gate recorded above. Job-Search Sprint V1 is therefore **CLOSED / FROZEN**.

This sprint-only closure does not convert historical FAIL, BLOCKED, DEFERRED, or
NOT CLAIMED records into PASS, and does not establish production readiness.
Feature expansion remains frozen. This ledger authorizes no provider call, PR
merge, CI rerun, architecture change, or successor implementation. Stop after
this documentation reconciliation.
