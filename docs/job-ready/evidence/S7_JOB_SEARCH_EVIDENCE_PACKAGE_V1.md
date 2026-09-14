# S7 Job-Search Evidence Package V1

Status: **S7-B EVIDENCE PACKAGE COMPLETE / JOB-SEARCH SPRINT V1 CLOSED / FROZEN**

This is a concise evidence index for interview and job-search use. It points at
repository evidence; it does not create new claims, authorize any provider call,
or modify any historical evidence. Claim boundaries in section 6 govern every
statement in this file.

## 1. Exact source identity

- Repository: `wanghanyu654321-cell/-agent`
- Branch: `job-search/sprint-v1`
- S7-B source baseline commit: `a7934e049b56b5d9519c74fa332efe8d72c0b4a0`
- S7-B source baseline tree: `c6c22faa6ec5c264e42bb8108eb74ef71a05edbf`
- Working tree at S7-B task start: clean
- Final S7-B docs commit: `782ddddf4a0193ab2f056f50e0ab7b7cd70e08b6`
- Final S7-B tree: `3b8ad30c78717f2f97a06231c47e2f56d0755d35`
- Final S7-B GitHub Actions run: [34759070549](https://github.com/wanghanyu654321-cell/-agent/actions/runs/34759070549)
- Job: [103728515129](https://github.com/wanghanyu654321-cell/-agent/actions/runs/34759070549/job/103728515129)
- Workflow: `Customer Support Agent Gate`; conclusion: `success` (PASS).
- The final S7-B commit is a docs-only descendant of the baseline above: only
  `AGENTS.md`, `README.md`, and the three S7-B documentation files differ; no
  product, test, migration, workflow, or dependency files changed in between.

Final reconciled closure baseline (distinct from the original S7-B evidence
identity above):

- Commit: `0a2d0f723814eb787e079195dc4326a944c1fd76`
- Tree: `f11b7f4ebec16c60d84a4a53065b6b10d406fe80`
- GitHub Actions run: [34766236491](https://github.com/wanghanyu654321-cell/-agent/actions/runs/34766236491)
- Job: [103747586810](https://github.com/wanghanyu654321-cell/-agent/actions/runs/34766236491/job/103747586810)
- Workflow: `Customer Support Agent Gate`; conclusion: `success`.
- Independent Final S7 Closure Review: **APPROVED WITH CONDITIONS**; review
  conditions: **SATISFIED** by authoritative branch integration and the final
  clean-runner Gate on this exact commit/tree.

S7 deliverables are complete and Job-Search Sprint V1 is CLOSED / FROZEN.
This is a sprint-only closure, not a production-readiness, hosted-provider, or
retrieval-quality PASS. The original S7-B identity remains historical evidence
and is not replaced; S7 is not rerun by this reconciliation.

## 2. What is actually demonstrated

Only items below are demonstrated, each backed by repository evidence listed in
section 5:

- one Pi-owned Agent Runtime (Pi packages pinned at exactly `0.84.3`) with
  unchanged bounded budgets (max 4 Agent turns, max 6 tool calls, 10s total,
  2s per tool, sequential tool execution);
- server-derived enterprise authority: identity/membership, tenant/store scope,
  roles and capabilities resolved by Node from its HttpOnly session, never
  self-declared by the client;
- tenant/store isolation verified against PostgreSQL in CI;
- Safety vertical slice with fail-closed precedence (safety escalation outranks
  the ordinary path);
- governed Evidence admission and grounding: retrieval produces candidate
  evidence only; Node Evidence Governance authorizes answers;
- ordinary 0/1/2+ answerability: 0 admissible candidates → fallback; exactly 1
  canonical candidate → answer eligible; 2+ → ambiguous/fallback;
- durable Ticket/Handoff persistence with scoped read-back and idempotency
  (a tool call is not proof until the durable read-back matches);
- PostgreSQL as the durable business source of truth, with the once-only
  transactional migration ledger through `005`;
- a private FastAPI retrieval boundary (no public FastAPI/PostgreSQL ports;
  service credential required);
- pgvector `vector(1536)` deterministic integration across the full path:
  migration `005` → `deterministic-test-1536-v1` → PostgreSQL → Python/FastAPI
  retrieval → Node `FastApiRetrievalService` → `PostgresRagRegistry` canonical
  reconciliation;
- Node canonical reconciliation that rejects FastAPI candidates with altered
  source/version/content/chunk/profile/scope;
- same-origin React StoreOps application mounted in the authenticated lifecycle;
- a thin S1 Evaluation Harness kept outside production paths;
- Docker delivery proof: image build/start, application startup/auth/FAQ, scoped
  ticket read-back, isolation, retained-volume recreation, and persistence in CI;
- independent clean-runner full regression on the exact sprint source.

These are engineering/integration proofs. They are not production, hosted-
provider, or retrieval-quality claims.

## 3. Primary demo path

The primary demonstration is the enterprise React/API application:

```text
docker compose up --build
```

Open `http://localhost:3000`, sign in with the public deterministic demo
identities recorded in `README.md`, and walk the five-minute proof journeys:

1. Identity and scope — `/api/v1/auth/me` behind the read-only role/capability/
   tenant/store display.
2. Governed FAQ — `请问门店营业时间？` exposes only authorized final evidence and
   the invoked tool.
3. Durable ticket — `帮我记录一个退款售后工单` becomes proof only through Alice's
   scoped Ticket read-back.
4. Role-sensitive handoff — Alice's ordinary handoff is denied; Susan's is
   durably confirmed via scoped read-back; Safety escalation stays a separate
   higher-precedence path.
5. Isolation and safe audit — Bob cannot read Tenant A records; Ava sees only
   Tenant A's public-safe audit DTO.
6. Companion deterministic demo — `npm run demo` (see section 4) for the seven
   curated scenarios without any login or external dependency.

S7-A environment limitation (recorded, not converted to PASS): the local
Windows machine used for S7-A had no local PostgreSQL or Docker runtime, so the
PostgreSQL/Docker-dependent local journeys (J1–J6) were BLOCKED locally and are
covered instead by the independent S6 clean-runner evidence in section 5. No
locally blocked execution is reported as a local PASS.

## 4. Controlled Portfolio Demo

`npm run demo` is a **DETERMINISTIC PORTFOLIO DEMO — NOT A PRODUCTION MODEL
PROVIDER.** It uses deterministic Pi faux messages to request real Runtime
tools; it does not replace the Runtime, knowledge admission, safety policy,
bounded evidence routing, authorization, or output guards.

S7-A result: all seven curated scenarios PASS (7/7):

| ID | Input | Real path | Outcome |
| --- | --- | --- | --- |
| `faq-business-hours` | `请问门店营业时间？` | `search_faq` → FAQ admission | answer with FAQ evidence |
| `single-refund-timing` | `退款一般多久到账？` | `search_knowledge` → one governed candidate | grounded answer with one evidence record |
| `no-governed-evidence` | `门店有免费停车位吗？` | `search_knowledge` → zero admitted candidates | fallback with no evidence |
| `ambiguous-refund-rules` | `这个退款到底应该按哪个规则处理？` | `search_knowledge` → two admitted candidates | bounded-routing fallback with no evidence |
| `safety-escalation` | `顾客做项目时皮肤越来越痒，我该怎么继续？` | safety detector → Runtime escalation/handoff | escalation and pause language |
| `ticket-creation` | `帮我记录一个退款售后工单` | authorized `create_ticket` | answer after a real tool call (requires `tickets:write`) |
| `human-handoff` | `这个投诉我需要转人工处理` | authorized `handoff_to_human` | escalation after a real tool call (requires `handoff:write` and `mayEscalate`) |

Boundary properties verified by S7-A:

- unknown free-form input fails closed through the real Runtime's no-evidence
  path (no invented business facts);
- no external provider or network model call is required;
- no embedding call is required;
- the real `SupportAgentRuntime` is still used (only the model-message source is
  deterministic);
- only the synthetic fixture (`demo://portfolio/...`, marked
  `synthetic_test_only`) is admitted by this composition; production defaults
  remain unchanged.

## 5. Validation evidence

- S6 full regression (primary full-coverage evidence): Customer Support Agent
  Gate — Run `34699201771` / Job `103567849816`, conclusion success; CI checkout
  tree exactly equals the S6 baseline tree. Full coverage list in
  `docs/job-ready/evidence/S6_FINAL_REGRESSION_V1.md`.
- Closure docs gate (documentation-only descendant of the S6 baseline): Customer
  Support Agent Gate — Run `34745748585` / Job `103693268338`, conclusion
  success.
- Final S7-B gate: Customer Support Agent Gate — Run `34759070549` / Job
  `103728515129`, conclusion `success`; commit
  `782ddddf4a0193ab2f056f50e0ab7b7cd70e08b6`, tree
  `3b8ad30c78717f2f97a06231c47e2f56d0755d35`. Final S7-B CI: PASS. This is
  CI evidence for that exact source, not an independent final S7 closure verdict.
- Final reconciled closure gate: Customer Support Agent Gate — Run `34766236491`
  / Job `103747586810`, conclusion `success`; commit
  `0a2d0f723814eb787e079195dc4326a944c1fd76`, tree
  `f11b7f4ebec16c60d84a4a53065b6b10d406fe80`. This exact clean-runner evidence
  satisfies the conditions of the Independent Final S7 Closure Review.
- S7-A existing-demo smoke: local read/run evidence recorded in this package
  (sections 4 and 7). It is NOT a committed CI artifact; no CI run ID is claimed
  for it.
- Sprint closure ledger: `docs/job-ready/evidence/JOB_SEARCH_SPRINT_V1_CLOSURE.md`.

## 6. Claim boundary

The following boundaries are preserved verbatim and govern this package:

```text
REAL HOSTED OPENAI EMBEDDING:
BLOCKED — VALID API CREDENTIAL UNAVAILABLE

RETRIEVAL QUALITY ACCEPTANCE:
NOT CLAIMED — GAP-05 unresolved

S3: DEFERRED
Hybrid/RRF: DEFERRED FOR JOB-SEARCH V1 / NOT GLOBALLY CANCELLED
Reranker: NOT JUSTIFIED IN JOB-SEARCH V1 / FUTURE GATE REQUIRES MEASURED NEED
Live WeCom: DEFERRED FROM JOB-SEARCH V1 / REMAINS SUCCESSOR ROADMAP WORK
MCP: DEFERRED FROM JOB-SEARCH V1 / REMAINS OPTIONAL SUCCESSOR ROADMAP WORK

No production-readiness claim.
```

## 7. S7-A smoke result

```text
S7-A EXISTING DEMO FINAL SMOKE: PASS WITH ENVIRONMENT LIMITATIONS
```

The seven deterministic demo scenarios passed 7/7 on the S7-A local run. The
locally blocked J1–J6 PostgreSQL/Docker journeys remain BLOCKED locally
(environment unavailable) and are not converted to PASS; server-side integration
evidence comes from the S6 clean runner (section 5).

## 8. Interview-safe claims

Evidence-backed phrasings safe for a resume or interview:

1. Built and verified a governed enterprise support-agent system — one Pi-owned
   Agent Runtime, server-derived tenant/store authority with fail-closed Safety,
   durable PostgreSQL Tickets/Handoffs, and 0/1/2+ evidence answerability — with
   the full regression suite (PostgreSQL gates, Docker persistence, safety and
   knowledge evals) passing on an independent clean-runner CI.
2. Delivered a deterministic pgvector `vector(1536)` retrieval integration
   across FastAPI/Python, PostgreSQL, and Node canonical evidence
   reconciliation, keeping lexical retrieval as the default and vector as an
   explicit opt-in — claimed strictly as integration correctness, with hosted
   embedding and retrieval-quality acceptance explicitly not claimed.
3. Ran a completion-first engineering-evidence process: independent gates with
   exact commit/tree binding, immutable historical failure records (including a
   rejected real-provider runtime proof), deliberate deferral ledgers, and
   explicit claim boundaries separating integration evidence from provider
   evidence from quality acceptance.
