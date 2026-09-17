# Customer Support Agent

An interview-grade customer-support Agent proof application. It preserves one Pi-owned
Agent Runtime while this repository owns the customer-support business boundary:
identity, tenant/store authority, governed evidence, Safety, durable Tickets/Handoffs,
and safe audit projection.

This is a deterministic synthetic portfolio demonstration. It is not a production
customer deployment, production IAM system, or professional safety knowledge
service. An explicitly configured Pi provider adapter is available only for
bounded integration proof; it is not the default Docker or CI mode and does not
constitute a real-store Pilot.

## Run the same-origin enterprise application

The application requires PostgreSQL. For a self-contained local demonstration:

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000). The React shell and
`/api/v1/*` share this same origin. Shut it down while keeping durable demo data:

```bash
docker compose down
```

Remove the disposable local PostgreSQL volume only when you want a new demo:

```bash
docker compose down -v --remove-orphans
```

The integration Compose stack has three services: `app`, private `ai-service`, and
PostgreSQL 16 with pgvector 0.8.0 (image pinned by digest in `compose.yaml`). Only
the Node port is published. The application waits for PostgreSQL health, applies
migrations 001–005 once through the existing transactional ledger, and repeat-safely
seeds the synthetic demo identities. `005_job_ready_rag_profiles.sql` binds
`rag_chunks.embedding` to `vector(1536)` and admits only the two approved S2
profiles (`openai-text-embedding-3-small-1536-v1` and
`deterministic-test-1536-v1`). Existing pre-ledger databases are not a
supported upgrade path; this proof uses disposable databases with the ledger.

Docker Compose is the documented, supported enterprise-demo path. The container
image sets `NODE_OPTIONS=--experimental-transform-types` internally, so the
Docker/CI execution path is unaffected. A bare direct Node execution
(`npm run start:enterprise`, which resolves to `node src/enterprise/application.ts`)
is not universally valid under local Node v24: the imported TypeScript modules use
parameter-property syntax that requires Node's transform-types runtime option. For
documented direct local Node execution, use the existing valid command form:

```text
node --experimental-transform-types src/enterprise/application.ts
```

This is a local direct-execution documentation clarification, not a product defect,
and the underlying limitation is not hidden: the package script itself is unchanged.

## Current branch: thin digital employee (pre-ICP)

The current branch is `job-ready/thin-digital-employee-v1`. Job-Search Sprint V1
is historical and frozen; its reconciled phase ledger, deliberate deferrals, and
claim boundaries live in
[Job-Ready Current State](docs/job-ready/CURRENT_STATE.md) and
[the closure ledger](docs/job-ready/evidence/JOB_SEARCH_SPRINT_V1_CLOSURE.md).
On top of that frozen baseline, this branch closed three successor engineering
stages, each with focused tests passing:

- Support request correlation (Request Debugging): engineering closure at
  `e4a4c43` on `job-ready/request-debugging-closure-v1`.
- Durable acceptance outcomes (Harness Acceptance Extension): engineering
  closure at `1ebbd37`, with the harness acceptance gate wired into the
  PostgreSQL application gate; independent read-only review: APPROVED WITH
  CONDITIONS.
- Thin digital employee identity: engineering closure at `48748ef` with a
  first-class AgentProfile layer; independent read-only review: APPROVED WITH
  CONDITIONS. The current runtime is the AgentProfile-governed architecture.

This task (Pre-ICP Evaluation Governance Consolidation V1) adds the evaluation
governance consolidation: a descriptive governance manifest over the existing
evaluation gates (`evals/governance/manifest.ts`), a deterministic regression
matrix aggregator (`evals/regression/matrix.ts`), and report-only MRR plus
difficulty breakdown in the retrieval evaluation (`src/retrieval-eval.ts`).
These are reported values; they create no new acceptance claim.

Clean-runner Gate evidence for this branch:

- Workflow: `Customer Support Agent Gate`
- Run: [35234497767](https://github.com/wanghanyu654321-cell/-agent/actions/runs/35234497767)
- Head: `8a780131cdb776de3fd0b7b1b62f9a9503fece18`
- Branch: `job-ready/thin-digital-employee-v1`
- Conclusion: `success`

This run supports: deterministic regression, PostgreSQL integration gates,
Python/RAG tests, Docker build/composition/persistence smoke, existing
evaluation gates.

This run does NOT support: public HTTPS deployment, ICP production deployment,
live WeCom wire integration, real production traffic, production Data Flywheel,
thin MCP, production-calibrated retrieval-quality acceptance, production-ready
claim.

Still true, inherited from the frozen sprint baseline:

- Deterministic vector/pgvector/FastAPI/Node integration: PASS (historical S6
  evidence; integration correctness, not semantic retrieval quality).
- Hosted OpenAI embedding: BLOCKED — VALID API CREDENTIAL UNAVAILABLE. No
  hosted-provider PASS is claimed.
- Retrieval quality acceptance: NOT CLAIMED — GAP-05 unresolved. The public
  retrieval regression is not semantic/vector retrieval quality acceptance,
  and MRR/difficulty are report-only.
- Waiting / not closed on this branch: public HTTPS deployment / ICP filing,
  live WeCom wire integration, production Data Flywheel, and thin MCP.

The application surface on this branch remains:

- The authenticated shell mounts the existing StoreOps views. Node resolves scope
  and capabilities for Availability, Booking Intents, Knowledge metadata, and
  Needs Attention. Set the operator-owned `STOREOPS_TIME_ZONE` to the store's actual
  IANA time zone to use Availability; no time zone is inferred from browser data.
- Private corpus startup registers approved canonical entries in the Node-owned
  registry. Knowledge views show approved active metadata, never the corpus body.
  The synthetic portfolio corpus is not registered as approved knowledge; its
  catalog is therefore empty in default demo mode.
- `ENTERPRISE_RETRIEVAL_MODE=lexical` remains the default. The reviewed
  `FastApiRetrievalService` can be injected through the enterprise runtime factory;
  deterministic integration tests and the clean runner cover canonical
  reconciliation and failure. Explicit `vector` mode is an opt-in that requires the
  full vector configuration (approved profile, dimension, service endpoint) and is
  exercised in CI with the deterministic `deterministic-test-1536-v1` profile;
  lexical is never silently replaced and there is no vector-to-lexical fallback.
- The private FastAPI image uses Python 3.11.15 and pinned `psycopg[binary]==3.2.10`.
  It remains a private retrieval service on the compose network: no public FastAPI
  or PostgreSQL ports are published, and its service credential is still required
  (an unauthenticated `/health` returns 401). The deterministic 1536-profile path is
  verified end-to-end against disposable PostgreSQL in CI; that is integration
  evidence, not a production embedding configuration.
- Policy-owned knowledge operations and real Pi tool events are reported
  separately. Set `JOB_READY_EVAL_REPORT_ROOT` to an external fresh directory for
  current offline regression reports without overwriting historical evidence.

Verification commands (PostgreSQL commands require a disposable pgvector-enabled
PostgreSQL 16 database; absence is a failure in dedicated gates, not a PASS):

```text
npm test
npm run test:job-ready
npm run test:postgres-identity
npm run test:postgres-business
npm run test:postgres-application
npm run test:postgres-core-a
npm run test:postgres-core-b
npm run test:postgres-job-ready
npm run build
npm run check
npm run integrity
cd ai-service
python -B -m unittest discover -s tests -v
```

Node PostgreSQL gates use `POSTGRES_TEST_URL`, except Core B uses
`POSTGRES_RAG_TEST_URL`; the Python live-driver test uses the latter too. Do not use
a production database. CI retains historical Safety/Knowledge/Retrieval and Docker
restart-persistence gates, with no external provider or embedding calls. Exact
tested/not-tested state and unresolved contracts are recorded in
[Job-Ready Current State](docs/job-ready/CURRENT_STATE.md).

Historical sprint full-regression evidence: the S6 clean runner
([run 34699201771](https://github.com/wanghanyu654321-cell/-agent/actions/runs/34699201771),
job `103567849816`, checkout tree exactly equal to the S6 baseline tree) covered
real PostgreSQL 001–005 identity/business/application, Core A, Core B, Job-Ready
gates, Python RAG 43/43, vector-postgres cross-language E2E, Docker
build/start/persistence, build/check, and all eval suites. It is regression
evidence, not approval of the unresolved hosted-provider or retrieval-quality
claims above; see
[S6 Final Regression Evidence](docs/job-ready/evidence/S6_FINAL_REGRESSION_V1.md).
That runner predates this branch's successor stages; this branch's own
clean-runner Gate evidence is recorded above (run 35234497767, conclusion:
success).

## Synthetic demo identities

These are public, deterministic demonstration credentials only. They are not real
accounts or production secrets.

| User | Email | Password | Server-derived scope |
| --- | --- | --- | --- |
| Alice Agent | `alice.agent@demo.example` | `AliceDemo!2026` | Tenant A / Store A1 / agent |
| Susan Supervisor | `susan.supervisor@demo.example` | `SusanDemo!2026` | Tenant A / Store A1 / supervisor |
| Bob Agent | `bob.agent@demo.example` | `BobDemo!2026` | Tenant B / Store B1 / agent |
| Ava Admin | `ava.admin@demo.example` | `AvaDemo!2026` | Tenant A / Store A1 / admin |

The browser stores no session token, role, capability, tenant, or store authority.
The server derives all of them from its HttpOnly session.

## Optional real Pi provider adapter

The default is `ENTERPRISE_RUNTIME_MODE=deterministic`; Docker and CI retain that
mode. A local integration proof can explicitly request Pi-managed authentication
and a Pi-recognized model without placing credentials in this repository:

```text
ENTERPRISE_RUNTIME_MODE=pi-real
PI_PROVIDER=<Pi provider id>
PI_MODEL=<Pi model id>
DATABASE_URL=<PostgreSQL URL>
node --experimental-transform-types src/enterprise/application.ts
```

The documented direct-Node command above uses the transform-types runtime option
because local Node v24 cannot strip the parameter-property syntax in the imported
modules; `npm run start:enterprise` is the same entrypoint without that option and
is not universally valid under local Node v24 (the Docker path sets it internally).

If Pi authentication or the configured model is unavailable, startup fails before
the HTTP server listens. The process does not fall back to deterministic mode.
See [the adapter directive](docs/portfolio/PILOT_REAL_PI_PROVIDER_DIRECTIVE.md)
for the bounded smoke and credential-handling rules.

## Five-minute proof journeys

1. **Identity and scope** — Log in as Alice and inspect the read-only role,
   capability, tenant, and store display backed by `/api/v1/auth/me`.
2. **Governed FAQ** — Ask `请问门店营业时间？`. The result exposes only authorized
   final evidence and the invoked tool, not provider payloads or session events.
3. **Durable ticket** — Ask `帮我记录一个退款售后工单`. A tool call is not treated as
   proof until Alice's scoped Ticket read-back contains the matching conversation.
4. **Role-sensitive handoff** — Alice's ordinary handoff remains denied; Susan's
   ordinary handoff can be durably confirmed through scoped read-back. Safety
   escalation remains a separate higher-precedence path.
5. **Isolation and safe audit** — Bob cannot read Tenant A records. Ava can read
   only Tenant A's public-safe audit DTO; raw payloads and Agent internals are not
   exposed.

## Delivery verification map

| Claim | Code boundary | Evidence |
| --- | --- | --- |
| Server-derived identity and tenant/store authority | `src/enterprise/auth.ts`, `src/enterprise/identity.ts` | identity and application PostgreSQL integration gates |
| Durable Ticket/Handoff scope and idempotency | `src/enterprise/business.ts`, `src/enterprise/postgres.ts` | PostgreSQL business gate and scoped HTTP read-back |
| One Pi Agent Runtime with governed business policy | `src/index.ts`, product-owned tools and policies | runtime and historical evaluation regressions |
| Same-origin React delivery | `src/enterprise/http-api.ts`, `web/` | enterprise application and frontend tests |
| Restart-persistent product delivery | `Dockerfile`, `compose.yaml`, `scripts/docker-delivery-smoke.mjs` | Docker smoke in `Customer Support Agent Gate` |

## Limits

- Pi remains an upstream runtime dependency; Pi core is not vendored or modified.
- The semantic selector is not a synchronous runtime dependency.
- No real provider/model call is made by the Docker delivery smoke.
- Hosted OpenAI embedding remains BLOCKED — VALID API CREDENTIAL UNAVAILABLE; no
  hosted-provider PASS is claimed.
- Retrieval quality acceptance remains NOT CLAIMED — GAP-05 unresolved; the public
  retrieval regression is not semantic/vector retrieval quality acceptance.
- S3 (bounded real-provider Golden Path), S4 retrieval ablation (including
  Hybrid/RRF), and the S5 reranker are deferred from the historical Job Search
  Sprint V1. They are sprint deferrals that remain successor roadmap work
  requiring new explicit user authorization, not global cancellations.
- Live WeCom protocol/identity wiring (GAP-01/02), public HTTPS/domain hosting
  and ICP filing, production Data Flywheel, and thin MCP are not closed on this
  branch and wait for explicit successor authorization.
- This stack is a bounded local Docker delivery proof, not a production, hosted,
  customer, SaaS, or production-operations deployment claim. It has no external
  live IM integration or multi-agent workflow. Deterministic pgvector integration
  evidence does not establish production vector search or semantic retrieval
  quality. No hosted HTTPS/customer deployment is claimed.

See [Job-Ready Current State](docs/job-ready/CURRENT_STATE.md) for the frozen
sprint state and claim boundaries,
[the closure ledger](docs/job-ready/evidence/JOB_SEARCH_SPRINT_V1_CLOSURE.md) and
[Job Search Sprint V1](docs/job-ready/JOB_SEARCH_SPRINT_V1.md) for the
historical sprint record, and
[Architecture Expansion Governance](docs/job-ready/ARCHITECTURE_EXPANSION_GOVERNANCE.md)
for the questions every future architecture proposal must answer. The frozen
architecture documents under `docs/` record the underlying runtime guarantees.
