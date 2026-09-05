# AGENTS.md

## 1. Repository purpose

This repository is an AI Application Engineering / FDE portfolio system that must remain a credible, inspectable, real-world engineering project rather than a feature-maximized SaaS.

Primary objective:

> Reach job-ready evidence for AI Application Engineer / FDE roles with the smallest real deployment surface that proves integration, Agent engineering, Python/FastAPI, RAG, PostgreSQL, React, evaluation, deployment and troubleshooting skills.

Secondary product objective:

> Deliver a narrow conversational AI front desk for 1–5 person beauty stores through Enterprise WeChat, reducing CRM interaction friction without rebuilding a full CRM.

The successor is additive. It is NOT a rewrite of the existing Customer Support Agent architecture.

## 2. Source of truth and mandatory reading

Repository code and governed repository documents are the source of truth.

Do not rely on chat summaries, prior agent memory, inferred intent, or old task descriptions when current repository evidence is available.

Before modifying an existing architectural boundary, read the current implementation and every applicable current architecture/contract/directive document. Directional agreement is not a document review. A code review requires reading the changed implementation and applicable tests/contracts.

For the current Job-Ready successor, every coding agent MUST read before implementation:

1. this `AGENTS.md`;
2. `docs/job-ready/CURRENT_STATE.md`;
3. `docs/job-ready/JOB_READY_PARALLEL_EXECUTION_DIRECTIVE.md`;
4. the relevant existing architecture/enterprise/runtime contracts for the files being changed;
5. `docs/job-ready/ARCHITECTURE_CONTRACT.md` once that file exists and has passed independent review.

Historical phase documents are evidence of prior decisions; they do not silently authorize new scope.

## 3. Permanent architecture invariants

The following boundaries are authoritative unless the user explicitly authorizes a successor architecture change:

- **Pi Runtime** remains the only Agent Runtime.
- **Node/TypeScript enterprise application** owns business authority, business truth, identity resolution, tenant/store scope, capabilities, workflow confirmation and durable business writes.
- **FastAPI/Python** owns only AI data/retrieval workloads authorized by the current directive. It MUST NOT directly confirm or mutate business truth.
- **PostgreSQL** remains the durable business source of truth. `pgvector` may extend PostgreSQL for retrieval; it does not become a second authority system.
- **React** is an operations/demo UI. It is not message-processing middleware and must not become an authority source.
- **Enterprise WeChat** is a communication channel. External message metadata must resolve through internal identity/membership authority.
- No incoming request may self-declare trusted `tenantId`, `storeId`, role or capabilities.
- **RAG retrieval produces Candidate Evidence only.** Retrieval does not authorize a factual answer. Existing Node Evidence Governance remains the answerability/grounding authority.
- Deterministic workflow should handle deterministic business transitions. LLM output is never equivalent to confirmed business state.

## 4. Authorized Job-Ready product surface

The current successor may implement only the bounded capabilities defined in the current Job-Ready directive:

- Enterprise WeChat text integration;
- approved store/project/group-buying knowledge;
- simple staff Availability;
- Booking Intent with explicit human/business confirmation boundary;
- Manager Handoff / Needs Attention;
- thin Python/FastAPI RAG service with pgvector;
- bounded React StoreOps views;
- hosted Linux/HTTPS/Docker delivery;
- bounded evaluation, latency/error observability and troubleshooting evidence;
- narrowly scoped Runtime reliability closure for real-provider badcases already recorded in `docs/job-ready/CURRENT_STATE.md`.

## 5. Explicitly out of scope

Do NOT add without a new explicit user authorization:

- ASR or voice pipeline;
- full CRM;
- membership, stored value, cashiering, inventory or marketing automation;
- full booking engine;
- full scheduling/workforce/attendance/payroll/leave engine;
- room/bed/device/capability scheduling;
- Meituan or Douyin real-time API integration;
- Multi-Agent architecture;
- MCP integration merely for resume keywords;
- Redis, Kafka or another queue platform when PostgreSQL is sufficient;
- Kubernetes;
- GraphRAG, Self-RAG, Agentic RAG or complex reranking;
- a large observability platform;
- any feature whose main effect is product expansion rather than job-readiness evidence or a proven Pilot blocker.

When uncertain, choose the smaller implementation and escalate the scope question rather than inventing features.

## 6. Authority and safety rules

- Preserve existing tenant/store isolation, RBAC/capability boundaries, Safety behavior, governed Evidence and durable business-state semantics unless a task explicitly targets one of those boundaries.
- Fail closed on missing identity, missing authority, ambiguous confirmed business state, unsupported factual evidence, or unsafe execution.
- Never place credentials, API keys, Enterprise WeChat secrets, private corpus contents or customer PII in the repository.
- Redact or omit sensitive values from logs, fixtures, eval reports and public evidence.
- External calls must be bounded. Do not introduce unbounded retry loops or silent fallback that changes authority or provider semantics.

## 7. Parallel-development governance

The current execution model is contract-first and parallel.

- GPT-6 owns core architecture/contracts, security-critical boundaries, Runtime reliability closure, WeCom/StoreOps core, FastAPI/RAG core and final shared-file integration.
- Qoder owns peripheral implementation under frozen contracts: bounded React components, frontend tests, eval cases/support code, deployment support files, smoke scripts, runbooks and documentation.
- Qoder MUST NOT redesign core contracts or independently change authority/runtime semantics.
- Shared composition files listed in the current Job-Ready directive are frozen during parallel work and may be changed only in the authorized GPT-6 integration/core track.
- Prefer isolated new directories and files on parallel branches.
- Do not let two agents concurrently own the same shared composition file.

`docs/job-ready/ARCHITECTURE_CONTRACT.md` is Task 0 of the implementation sprint. DTO/schema-dependent work must not assume an unstated contract before that contract has passed independent review.

## 8. Quality requirements

Every new capability must include, as applicable:

- deterministic tests;
- tenant/store isolation tests;
- authorization tests;
- invalid-input behavior;
- explicit failure behavior;
- idempotency for replayable channel/business events;
- bounded external-call behavior;
- safe logging/PII handling;
- contract tests across Node ↔ FastAPI where schemas cross process boundaries;
- reproducible smoke/health evidence for deployment paths.

RAG must include a bounded retrieval evaluation. A vector database integration without measured retrieval behavior is not sufficient job-ready evidence.

## 9. Review, merge and claim boundary

Implementation completion is not approval.

No coding agent may, without explicit user authorization:

- merge a PR;
- tag or release;
- mark a governed Draft PR Ready;
- claim production readiness;
- claim customer deployment or Pilot success;
- claim a failed Gate as passed;
- rerun a bounded provider evaluation after its authorized budget is exhausted;
- broaden execution authority because implementation appears safe.

Independent Gate review must inspect repository evidence and may conclude only:

- `APPROVED`
- `APPROVED WITH CONDITIONS`
- `REJECTED`
- `INFORMATION INSUFFICIENT`

## 10. Current execution directive

The authoritative current sprint directive is:

`docs/job-ready/JOB_READY_PARALLEL_EXECUTION_DIRECTIVE.md`

This `AGENTS.md` controls repository-wide governance and architecture invariants. The current directive controls sprint-specific ownership, sequencing and implementation scope when it does not conflict with this file.
