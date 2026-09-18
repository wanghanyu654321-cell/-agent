# Job-Ready Parallel Execution Directive

Status: **GOVERNANCE BASELINE / IMPLEMENTATION NOT YET AUTHORIZED BY THIS DOCUMENT ALONE**

This directive governs the final Job-Ready successor sprint after the PR #9 evidence work has stopped.

## 1. Background and objective

The repository already contains a substantial interview-grade Customer Support Agent system with one Pi-owned Agent Runtime and repository-owned enterprise boundaries for identity, tenant/store authority, governed Evidence, Safety, durable Ticket/Handoff state, PostgreSQL, React delivery, Docker delivery, evaluation and badcase regression.

The successor is NOT a rewrite.

Its purpose is to close the remaining high-value job-readiness gaps with the smallest real-world implementation:

1. Enterprise WeChat text integration;
2. a thin Store Operations workflow;
3. Python/FastAPI service ownership;
4. practical RAG with PostgreSQL + pgvector;
5. React StoreOps operations/demo views;
6. real hosted Linux/HTTPS/Docker deployment;
7. bounded evaluation, observability and troubleshooting evidence;
8. narrowly scoped closure of the two real-provider Runtime reliability badcases recorded in `CURRENT_STATE.md`.

Primary objective:

> AI Application Engineer / FDE job readiness.

Product objective:

> A conversational AI front desk for 1–5 person beauty stores that reduces CRM interaction friction through Enterprise WeChat without rebuilding a full CRM.

## 2. Product scope

Only the following business capabilities are authorized.

### A. Knowledge

Answer only from approved store/project/group-buying/operating-rule evidence.

The Agent must fail closed or hand off when evidence is missing, ambiguous or unauthorized.

### B. Availability

Maintain only simple staff availability sufficient to answer questions such as whether a staff member/time window is available.

Do not build workforce management, attendance, payroll, leave approval, room/bed/device scheduling or capability scheduling.

### C. Booking Intent

Capture customer booking intent.

An intent is NOT a confirmed booking until an authorized human/business workflow confirms it.

Allowed states:

- `pending_confirmation`
- `confirmed`
- `alternative_proposed`
- `cancelled`

The LLM may extract or propose an intent. It must not self-authorize `confirmed` business state.

### D. Manager Handoff / Needs Attention

Unknown, conflicting, unauthorized, special-price, exceptional or otherwise unresolved cases must surface for manager handling rather than trigger speculative automation.

## 3. Explicitly out of scope

Do NOT implement in this sprint:

- ASR / voice transcription;
- full CRM;
- membership;
- prepaid/stored-value cards;
- cashiering;
- inventory;
- marketing automation;
- full booking engine;
- full scheduling/workforce engine;
- Meituan API;
- Douyin API;
- Multi-Agent;
- MCP;
- Redis;
- Kafka;
- Kubernetes;
- GraphRAG;
- Self-RAG / Agentic RAG;
- complex reranking;
- complex observability platform;
- unrelated framework migrations or rewrites.

No functionality outside this scope may be added without a new explicit user authorization.

## 4. Architecture invariants

The following boundaries MUST remain authoritative.

### Node / TypeScript enterprise application

Owns:

- business authority and business truth;
- internal identity resolution;
- tenant/store scope;
- roles/capabilities;
- workflow confirmation;
- durable confirmed business writes;
- existing Evidence Governance and answerability boundaries.

### Pi Runtime

Remains the only Agent Runtime.

No second Agent runtime/orchestrator may be introduced around or beside Pi.

### FastAPI / Python

Owns only authorized AI data/retrieval workloads.

The first authorized service surface should remain thin. The intended baseline is:

- `GET /health`
- `POST /knowledge/ingest`
- `POST /knowledge/search`

Additional endpoints require a demonstrated need and contract update.

FastAPI MUST NOT directly confirm or mutate business truth such as confirmed booking state, employee authority, tenant/store membership or approval state.

### PostgreSQL + pgvector

PostgreSQL remains the durable source of truth. pgvector extends the same persistence layer for retrieval and does not become a second authority store.

### React

React is an operations/demo surface. It may display and invoke authorized backend operations but must not become message-processing middleware or a source of tenant/store/role authority.

### Enterprise WeChat

Enterprise WeChat is a channel, not an Agent runtime or authority system.

External `corp/user/message` identity must resolve through an internal ChannelBinding → User/Membership → tenant/store/role/capabilities path.

No callback/request body may self-declare trusted `tenantId`, `storeId`, role or capabilities.

## 5. RAG boundary

The only authorized initial RAG path is:

```text
Approved Document
→ Chunk
→ Embedding
→ PostgreSQL + pgvector
→ tenant/store/status metadata filtering
→ Top-K Candidate Evidence
→ existing Node Evidence Governance
→ Pi Agent Runtime
```

FastAPI retrieval output is Candidate Evidence only.

Retrieval does not authorize a factual answer.

Initial RAG implementation must remain intentionally thin. Do not add GraphRAG, reranking or agentic retrieval unless a measured evaluation later proves that the simple path is insufficient and the user explicitly authorizes the expansion.

## 6. Runtime reliability closure

The final authorized real-provider run on PR #9 produced durable evidence of two distinct failure classes:

1. `A_SINGLE_EVIDENCE`: `search_knowledge` executed but the final result was fallback with no authorized evidence at approximately the frozen overall timeout boundary;
2. `B_ZERO_EVIDENCE`: the result correctly fell back but the model/tool path called only `search_faq`, not the frozen contract-required `search_knowledge` path.

This successor may include a **narrow Runtime Reliability Closure** for those observed classes only.

The goal is not to tune the model until a benchmark turns green. The goal is to make the production/runtime contract deterministic enough that:

- already verified authorized evidence is not incorrectly discarded merely because the provider finishes around an arbitrary overall deadline;
- ordinary knowledge fallback/routing does not depend on the model opportunistically deciding whether the governed knowledge path should be checked when the contract requires that check.

Required constraints:

- preserve Safety precedence;
- preserve Evidence admission/authorization rules;
- preserve tenant/store authority;
- preserve business-side-effect guards;
- preserve the single Pi Runtime architecture;
- add deterministic regression tests before any new external-provider validation is considered;
- this directive does **not** authorize another PR #9 A/B/C provider rerun.

Any future real-provider validation requires a separate explicit authorization and a fresh bounded evidence contract.

## 7. Task 0 — Architecture Contract

Before DTO/schema-dependent parallel implementation begins, GPT-6 must create:

`docs/job-ready/ARCHITECTURE_CONTRACT.md`

At minimum it must freeze:

1. StoreOps domain objects and state transitions;
2. database schema/migration ownership;
3. WeCom callback and identity-binding contract;
4. Node ↔ FastAPI request/response schemas;
5. RAG Candidate Evidence schema;
6. React-facing API DTOs required for StoreOps views;
7. error categories/codes where cross-process behavior depends on them;
8. idempotency keys for replayable WeCom events/business requests;
9. shared-file ownership and integration points.

The contract must be reviewed independently before agents assume unstated cross-service schemas.

## 8. Parallel ownership

After Task 0 is frozen, implementation should run in parallel from a common authoritative baseline.

### GPT-6 Core Track A — Runtime + WeCom + StoreOps

Owns:

- narrow Runtime reliability closure;
- StoreOps domain interfaces and state transitions;
- WeCom verification/decryption/adapter core;
- WeCom external-user → internal identity/membership mapping;
- security-critical/idempotency tests;
- StoreOps repositories/services and migrations where contractually required;
- business authority integration.

Prefer isolated new paths such as:

- `src/channels/wecom/**`
- `src/storeops/**`
- focused tests for those paths.

### GPT-6 Core Track B — FastAPI + RAG

Owns:

- `ai-service/**`;
- FastAPI/Pydantic contract implementation;
- ingestion/search core;
- embedding adapter boundary;
- pgvector retrieval query implementation;
- tenant/store/status filtering;
- Python tests;
- Node ↔ FastAPI contract-test hooks needed for final integration.

Keep this service retrieval-focused. Do not move confirmed business workflow into Python.

### Qoder Peripheral Track C — React StoreOps

Owns, under frozen APIs/contracts:

- `web/src/storeops/**`;
- bounded StoreOps UI components;
- frontend unit/component tests;
- fixtures/mocks that exactly match the frozen DTOs.

Target views are limited to:

- Today Availability;
- Booking Intents;
- Knowledge / Evidence;
- Needs Attention;
- optionally a bounded recent WeCom/conversation status view if the contract requires it.

Qoder must not redesign backend APIs or alter Runtime/authority semantics.

### Qoder Peripheral Track D — Eval / Deployment Support / Docs

Owns, under frozen contracts:

- bounded RAG evaluation cases;
- evaluation support code that does not redefine retrieval authority;
- deployment support files under isolated paths;
- smoke scripts;
- runbooks;
- job-ready evidence documentation.

The initial RAG evaluation should remain small but credible, targeting approximately 30–50 human-authored queries and at least:

- Recall@3;
- Wrong Evidence Rate;
- No-answer Accuracy;
- Retrieval Latency.

Do not manufacture positive results. Record failed or neutral comparisons honestly.

## 9. Shared-file freeze during parallel work

During parallel implementation, the following shared composition files are frozen unless a task is explicitly assigned to the GPT-6 core/integration owner:

- `src/enterprise/application.ts`
- `src/enterprise/http-api.ts`
- `src/enterprise/identity.ts`
- `src/enterprise/postgres.ts`
- `src/enterprise/pi-runtime.ts`
- `src/index.ts`
- `web/src/App.tsx`
- `compose.yaml`
- `Dockerfile`
- `package.json`
- `package-lock.json`

Peripheral branches must not change these files.

Runtime Reliability Closure may require a deliberate GPT-6-owned change to `src/index.ts`; that is a core task, not a peripheral exception.

Final shared-file integration is GPT-6-owned and must happen after the parallel branch contracts are satisfied.

## 10. Deployment target

The intended thin production-like topology is:

```text
Internet
→ Domain / HTTPS
→ Nginx
→ Linux host
→ Docker Compose
   ├─ Node enterprise app
   ├─ FastAPI ai-service
   └─ PostgreSQL + pgvector
```

Do not introduce Kubernetes, Redis or Kafka merely to make the architecture look more enterprise.

Deployment evidence must include a reproducible health/smoke path and restart-persistence expectations appropriate to each durable component.

## 11. Bounded observability

The sprint should add only enough structured evidence to debug a real end-to-end request. Where applicable record safe versions of:

- `requestId`
- `conversationId`
- tenant/store scope identifiers
- `channel=wecom`
- total latency
- retrieval latency
- Agent/model latency where measurable
- DB latency where measurable
- result type
- error category
- tools called
- evidence count

Do not expose secrets, raw private corpus content, hidden reasoning or unnecessary customer PII.

Do not block the Pilot on a full Prometheus/Grafana/OpenTelemetry platform.

## 12. Quality requirements

Every new capability must include, as applicable:

- deterministic tests;
- tenant/store isolation tests;
- authorization tests;
- invalid-input behavior;
- failure behavior;
- idempotency for callback/event replay;
- no silent fallback that changes authority;
- no secrets in repository;
- no unbounded external calls;
- versioned cross-process contract tests;
- reproducible health/smoke evidence.

Existing frozen Safety, Knowledge, Authority, PostgreSQL, React and Docker regressions must not be weakened to make successor tests pass.

## 13. Integration sequence

The intended sequence is:

```text
Governance baseline
→ Task 0 Architecture Contract
→ Independent Contract Gate
→ parallel Core/Peripheral tracks
→ GPT-6 shared-file Integration
→ full regression + integration + deployment evidence
→ independent Job-Ready Final Gate
```

Do not serially wait for one entire product feature when independent isolated work can proceed under the frozen contract.

## 14. Merge / release / claim boundary

Implementation branches may be created and tested.

This directive does NOT authorize:

- merge;
- tag;
- release;
- marking a governed Draft PR Ready;
- production-readiness claims;
- customer-deployment/Pilot-success claims;
- autonomous customer replies;
- widening Runtime/provider authority;
- additional PR #9 provider reruns.

Integration evidence must receive independent review before any such state transition.

Final independent Gate verdicts may only be:

- `APPROVED`
- `APPROVED WITH CONDITIONS`
- `REJECTED`
- `INFORMATION INSUFFICIENT`
