# Phase 2C-A Final Execution Directive

Status: **AUTHORIZED FOR IMPLEMENTATION**

Repository: `wanghanyu654321-cell/-agent`

Execution branch: `feat/phase-2c-product-workspace`

Exact base commit: `f8816bb6a3879fcae03629d440bd5a8a99b429ae`

Base tree: `a2c04de03de98d1c900d315e9b04ffd7a12edea2`

Merge: **NOT AUTHORIZED**

Release/tag: **NOT AUTHORIZED**

Semantic selector runtime integration: **NOT AUTHORIZED**

---

## 1. Mission

Phase 2C-A converts the already-approved enterprise backend boundaries into an interview-grade product workspace without changing the meaning of the existing Agent Runtime.

The user-visible causal chain must become operable and understandable:

```text
Authenticated Actor
  -> Server-derived Role / Capabilities / Tenant / Store
  -> Customer Request
  -> SupportAgentRuntime
  -> Evidence / Safety / Tool Decision
  -> Answer | Fallback | Escalation
  -> Ticket / Handoff / Audit
  -> PostgreSQL durable state
  -> React proof surface
```

This phase is not a new Agent capability phase. It is a **product-composition and proof-surface phase**.

The final UI must make the existing enterprise behavior visible enough that an interviewer can verify authority, evidence, safety, business side effects, persistence, and tenant isolation without reading source code first.

---

## 2. Product / Job-Ready objective

The Customer Support Agent is a Job-Ready technical portfolio for AI Application / Agent / FDE-oriented roles.

Phase 2C-A must strengthen two forms of evidence simultaneously:

1. **Product evidence** — a user can operate the system and understand why the Agent answered, failed closed, escalated, or created a business record.
2. **Engineering evidence** — the browser is only a presentation client; authority, tenancy, persistence, and Runtime semantics remain server-owned and regression-tested.

Do not add features solely because they appear in AI job descriptions. This phase must remain thin and complete.

---

## 3. Current approved boundaries that Phase 2C-A must preserve

### 3.1 Runtime ownership

Pi remains the single generic Agent Runtime dependency.

The product repository owns business policy, four customer-facing tools, evidence governance, safety, authority projection, business persistence, HTTP boundaries, UI, and delivery composition.

Do not fork, copy, or reimplement Pi Agent / SessionManager / provider runtime internals.

### 3.2 Existing customer-facing tools

The approved tool surface remains exactly:

- `search_faq`
- `search_knowledge`
- `create_ticket`
- `handoff_to_human`

Phase 2C-A does not add a plugin platform, generic Tool Registry product, browser-side tool execution, or MCP runtime dependency.

### 3.3 Ordinary knowledge routing

The authoritative synchronous Runtime route remains:

```text
0 admitted candidates -> fail closed
1 admitted candidate  -> governed single-evidence path
2+ admitted candidates -> ambiguous -> fail closed
```

The semantic selector remains offline and must not be invoked from the product hot path.

### 3.4 Safety precedence

Safety semantics are frozen.

Mandatory safety escalation retains precedence over ordinary capability gating. A customer-facing escalation may only be represented as successfully completed when the required durable handoff side effect is actually established.

Do not redesign Safety in React, the composition root, or the HTTP adapter.

### 3.5 Server authority

Browser-supplied role, capability, tenant, or store values are never authoritative.

The authoritative path remains:

```text
HttpOnly session cookie
  -> auth session
  -> user
  -> membership
  -> code-owned role/capabilities
  -> tenant/store scope
  -> SupportExecutionContext
```

The UI may display this context. It may not choose, override, or manufacture it.

### 3.6 Durable business state

PostgreSQL remains authoritative for durable product records:

- conversations
- tickets
- handoffs
- audit events

Pi session state and durable business state remain intentionally separate boundaries.

---

## 4. Explicit non-goals / forbidden expansion

The following are out of scope for Phase 2C-A:

- Python/FastAPI rewrite or companion service
- MCP Server
- IM/channel integrations
- multi-agent architecture
- Agent Builder
- billing / metering
- scheduler / cron product
- vector database
- Hybrid RAG implementation
- GraphRAG / LightRAG
- generic memory platform
- provider load balancer / model router
- Kubernetes
- Redis / Kafka
- generic analytics dashboard
- production enterprise IAM claims
- raw Pi event streaming to the browser
- semantic-selector hot-path integration

If implementation appears to require one of these, stop that subpath and preserve the simpler approved architecture.

---

## 5. Phase 2C-A product scope

Phase 2C-A contains two implementation layers.

### Layer A — Application Composition Root

Create a thin product bootstrap that composes existing approved parts into one runnable application.

Required composition:

```text
Configuration / environment
  -> PostgreSQL Pool
  -> existing migrations
  -> deterministic synthetic portfolio seed
  -> PostgresIdentityRepository
  -> PostgresEnterpriseBusinessRepository
  -> EnterpriseAuthService
  -> EnterpriseSupportService
  -> SupportAgentRuntime / approved deterministic portfolio mode
  -> Enterprise HTTP server
  -> same-origin React static assets
```

Requirements:

- no Runtime semantic rewrite;
- no duplicated auth implementation;
- no duplicated persistence layer;
- no browser-side secrets;
- startup/shutdown lifecycle must close server/database resources cleanly;
- deterministic portfolio mode must remain identifiable as synthetic/demo behavior;
- re-running application bootstrap must not require manual deletion of already-seeded demo identities.

### Layer B — React Enterprise Workspace

Use:

- React
- ReactDOM
- TypeScript
- Vite

Do not introduce a large state-management or UI framework unless an implementation blocker is demonstrated.

Primary surfaces:

1. Login
2. Support Workspace
3. Tickets
4. Handoffs
5. Audit — capability-gated
6. Identity / Role / Tenant / Store context header
7. Logout

No generic SaaS dashboard is required.

---

## 6. Same-origin rule

Final product execution must present React and `/api/v1/*` from one application origin.

Development tooling may use Vite internally, but the delivered product must not depend on permissive wildcard CORS.

The existing HttpOnly / SameSite session design must remain meaningful in the product composition.

---

## 7. Proof UI contract

The Support Workspace is not a generic ChatGPT clone.

For each completed support turn, the user must be able to understand, using only public-safe fields:

- request text;
- final result type: `answer | fallback | escalation`;
- final response text;
- safe evidence references actually authorized in the `SupportResult`;
- customer-facing tools called when safe to expose;
- whether a business outcome exists, such as ticket or handoff;
- a concise explanation category for controlled fallback / safety escalation when derivable from the existing public contract or safe product-owned metadata.

Do not expose:

- hidden chain of thought;
- raw Pi messages;
- raw provider payloads;
- raw internal `AgentEvent[]`;
- credentials;
- stack traces;
- unfiltered audit payloads;
- evidence that was admitted only as an internal candidate but not authorized in the final result.

---

## 8. Demo identities and role proof

The deterministic product demo must support these existing portfolio identities:

### Alice Agent

Scope: Tenant A / Store A1

Expected capability behavior:

- invoke Agent: allowed;
- read scoped conversations: allowed;
- create ticket: allowed;
- ordinary handoff: denied;
- mandatory safety escalation: still allowed through the existing safety path;
- audit read: denied.

### Susan Supervisor

Scope: Tenant A / Store A1

Expected capability behavior:

- Alice capabilities;
- ordinary handoff: allowed;
- audit read: denied unless the existing role model is explicitly changed by a separately reviewed contract. Do not silently promote Susan.

### Bob Agent

Scope: Tenant B / Store B1

Expected capability behavior:

- same Agent-level permissions as Alice;
- cannot see Tenant A / Store A1 conversations, tickets, handoffs, or audit state.

### Admin proof

Audit is currently `admin`-only by code-owned capability mapping. Phase 2C-A may add one **synthetic portfolio-only admin identity** if required to demonstrate Audit.

Boundary:

- adding a deterministic admin fixture is allowed;
- building user management, role editing, IAM administration, or tenant switching UI is not allowed.

---

## 9. Required user journeys

### Journey A — governed answer

Alice logs in and submits a request that has exactly one governed evidence source.

Expected proof:

- result = answer;
- authorized evidence shown;
- no unrelated evidence shown;
- identity/scope visible.

### Journey B — ambiguous evidence

Alice submits a request that results in 2+ admitted ordinary-knowledge candidates.

Expected proof:

- controlled fallback;
- no semantic selector call;
- no unauthorized candidate body exposed as final evidence.

### Journey C — ticket

Alice submits a deterministic ticket-producing request.

Expected proof:

- ticket side effect exists;
- Tickets surface shows the durable record;
- duplicate execution does not create duplicate durable tickets when the same idempotency contract applies.

### Journey D — ordinary handoff denied

Alice requests ordinary human handoff.

Expected proof:

- ordinary handoff is not persisted;
- user receives controlled failure/fallback behavior;
- UI does not imply handoff success.

### Journey E — safety escalation

Alice submits the approved safety-risk scenario.

Expected proof:

- safety result = escalation;
- durable handoff exists;
- UI clearly distinguishes mandatory safety escalation from ordinary discretionary handoff.

### Journey F — supervisor handoff

Susan logs in and performs ordinary handoff.

Expected proof:

- ordinary handoff succeeds;
- durable handoff is visible in Handoffs.

### Journey G — tenant isolation

Bob logs in after Alice/Susan activity.

Expected proof:

- Tenant A data is absent;
- old client presentation state is cleared on logout/session replacement;
- all business lists are refetched under Bob's server-derived scope.

### Journey H — audit

Portfolio admin logs in.

Expected proof:

- safe structured audit list is visible;
- Agent/Supervisor cannot access the audit endpoint/surface;
- raw internal traces are not exposed.

---

## 10. Frontend session-security requirements

- Treat `GET /api/v1/auth/me` as the source of current identity context.
- Do not persist authority state as a trusted browser credential.
- On logout, clear all user-scoped React state before another identity can render.
- On 401, invalidate current frontend session state and return to Login.
- On 403, render an authorization state without changing server-side capability rules.
- Never place session tokens in localStorage/sessionStorage.
- Never cache Tenant A records across a subsequent Bob session.

---

## 11. HTTP/API rules

Prefer the existing enterprise HTTP boundary.

Allowed additions are limited to product-composition requirements such as:

- same-origin static asset serving;
- a bounded public-safe product endpoint only if an existing page cannot be implemented from the currently approved API without exposing unsafe internals;
- deterministic demo/bootstrap wiring.

Any new endpoint must:

- authenticate before scoped business access;
- derive tenant/store from server context;
- have explicit capability requirements;
- return public-safe DTOs;
- reject client authority overrides;
- have tests.

Do not create a parallel `/api/v2` architecture.

---

## 12. Allowed implementation areas

Primary allowed files/areas:

- `package.json`
- `package-lock.json`
- `tsconfig*.json`
- `vite.config.*`
- new product bootstrap files under `src/enterprise/`
- bounded changes to `src/enterprise/http-api.ts`
- bounded changes to `src/enterprise/demo-data.ts`
- new React application files under `web/`
- new Phase 2C tests under `tests/`
- `.github/workflows/customer-support-agent-gate.yml` only to add Phase 2C build/test coverage without weakening existing jobs
- Phase 2C documentation under `docs/portfolio/`
- `docs/support-agent/ARCHITECTURE.md` and `docs/support-agent/CURRENT_STATE.md` only after implementation evidence exists

---

## 13. Forbidden implementation areas without a new directive

Do not modify Runtime semantics in:

- `src/index.ts`
- `src/safety.ts`
- `src/knowledge.ts`
- `src/semantic-selector.ts`
- `evals/selection/semantic/**`
- frozen historical Gate evidence
- immutable historical migration semantics

If a frontend/product requirement seems to require changing these files, the requirement must be solved at the composition/DTO/UI layer or escalated for a new design decision.

---

## 14. Required tests / Gate 2C-A

Phase 2C-A is not complete because pages render. The candidate must prove all gates below.

### Gate A — Authentication

- valid demo login succeeds;
- invalid credentials fail;
- `/auth/me` restores current context;
- logout invalidates session;
- expired session becomes unauthenticated;
- browser never receives raw session token through JSON.

### Gate B — Authority

- Agent can invoke support and create tickets;
- Agent ordinary handoff is denied;
- Supervisor ordinary handoff succeeds;
- Audit is admin-only;
- browser-provided role/capability/tenant/store cannot elevate authority.

### Gate C — Tenant isolation

- Alice cannot read Bob business state;
- Bob cannot read Alice business state;
- cross-scope business writes remain rejected by PostgreSQL constraints;
- logout/login clears stale presentation state.

### Gate D — Agent semantics

Regression proof must preserve:

- FAQ admission behavior;
- ordinary 0/1/2+ knowledge routing;
- Safety precedence;
- ticket/handoff idempotency;
- answer/fallback/escalation contract;
- semantic-selector synchronous invocation count remains zero.

### Gate E — Product comprehension

A reviewer can determine from UI alone:

- who is acting;
- which tenant/store is active;
- what the customer asked;
- whether the result was answer/fallback/escalation;
- what evidence was actually authorized;
- whether Ticket/Handoff business state was created;
- why a role can/cannot perform the demonstrated ordinary handoff.

### Gate F — Existing clean-runner regression

All pre-Phase-2C mandatory checks remain passing. Existing tests/evals may not be deleted, weakened, skipped, or reclassified to make Phase 2C pass.

---

## 15. Build / dependency discipline

- Use React + ReactDOM + TypeScript + Vite as the default frontend stack.
- Keep dependency additions minimal and pinned through the lockfile.
- Prefer platform `fetch` and React primitives over adding client libraries without evidence of need.
- Preserve Node `>=22.19.0`.
- Do not weaken Biome/type checks.
- Product build must produce both server and frontend artifacts deterministically.

---

## 16. Phase 2C-A implementation order

Implement in this order unless code evidence forces a documented deviation:

1. establish product composition root and deterministic startup/shutdown;
2. make deterministic seed safe for repeated product bootstrap;
3. preserve and test enterprise API under the real composition;
4. add React/Vite build skeleton;
5. implement auth/session shell and identity/scope header;
6. implement Support Proof Workspace;
7. implement Tickets and Handoffs;
8. add bounded admin fixture and safe Audit surface;
9. implement logout/session-switch cache clearing;
10. add browser-facing/unit/integration acceptance coverage feasible inside the repository;
11. run complete existing regression suite;
12. update architecture/current-state docs only after code evidence exists;
13. submit for independent Phase 2C-A Gate review.

Do not start Phase 2C-B Docker closure until Phase 2C-A is independently accepted.

---

## 17. Resume / scope-boundary discipline

Phase 2C-A must not inflate claims.

Allowed eventual claim examples, only after Gate passes:

- React enterprise support workspace over a server-derived RBAC/tenant boundary;
- durable PostgreSQL conversation/ticket/handoff/audit business state;
- public-safe evidence and safety explanation surface;
- role-sensitive human handoff and cross-tenant isolation demonstration.

Forbidden claim examples:

- production IAM;
- generic multi-tenant Agent platform;
- production-scale RAG/vector search;
- MCP platform;
- seven-channel IM integration;
- real customer deployment;
- production SLA;
- autonomous multi-agent orchestration.

Every portfolio claim must be traceable to code + test + demo + explicit limitation.

---

## 18. Stop conditions

Stop implementation and request a new design decision if any of the following becomes necessary:

- changing Safety semantics;
- changing 0/1/2+ routing semantics;
- enabling semantic selector synchronously;
- trusting browser tenant/store/role;
- exposing raw Pi/provider internals to React;
- creating a second generic Agent Runtime;
- weakening an existing PostgreSQL constraint;
- deleting or weakening existing regression evidence;
- adding a large platform feature outside the explicit Phase 2C-A scope.

---

## 19. Completion state

Phase 2C-A can only be reported as one of:

- `APPROVED`
- `APPROVED WITH CONDITIONS`
- `REJECTED`
- `INFORMATION INSUFFICIENT`

Implementation completion alone is not approval.

No merge, tag, release, Phase 2C-B, MCP, Python/FastAPI, Hybrid RAG, SSE, or IM successor work is authorized by this directive.
