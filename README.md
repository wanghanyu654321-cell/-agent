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
migrations 001–004 once through the existing transactional ledger, and repeat-safely
seeds the synthetic demo identities. Existing pre-ledger databases are not a
supported upgrade path; this proof uses disposable databases with the ledger.

## Job-Ready integration candidate

`job-ready/integration-v1` composes the reviewed Core A/B and Track C/D checkpoints
from contract `7c9b694d586fe4c557a195b554a97cc89e5c8f24`. It is not independently
approved and does not authorize a release or a real-provider rerun.

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
  deterministic integration tests cover canonical reconciliation and failure.
  `vector` mode explicitly fails startup: GAP-03 embedding profile and GAP-04
  relevance floor are not approved. There is no vector-to-lexical fallback.
- The private FastAPI image uses Python 3.11.15 and pinned `psycopg[binary]==3.2.10`.
  Its existing unconfigured engine remains unavailable: `/health` requires a
  service credential and returns 503 until dependencies/profile are approved.
  The driver is verified against disposable PostgreSQL in CI, not used to invent
  a production embedding configuration. No public FastAPI or PostgreSQL ports.
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

The code checkpoint `9371b9de3628ad1fcec0c11c96566f42227cfcc0` passed
[clean-runner 34080970418](https://github.com/wanghanyu654321-cell/-agent/actions/runs/34080970418),
including real PostgreSQL 003/004, Python driver, and Docker persistence/private
service checks. This is integration evidence for independent review, not approval
of the unresolved production vector or live-channel contracts.

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
npm run start:enterprise
```

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
- This stack is a bounded local Docker delivery proof, not a production, hosted,
  customer, SaaS, or production-operations deployment claim. It has no external
  live IM integration or multi-agent workflow. pgvector schema/guard evidence does
  not establish production vector search. WeCom protocol/identity (GAP-01/02),
  embedding profile/egress (GAP-03), relevance floor (GAP-04), retrieval quality
  thresholds (GAP-05), and the frozen measurement DTO's missing returned sourceRefs
  remain unresolved. No hosted HTTPS/customer deployment is claimed.

See [Phase 2C-B's successor contract](docs/portfolio/PHASE_2C_B_FINAL_EXECUTION_DIRECTIVE.md)
for the delivery boundary and the frozen architecture documents under `docs/` for
the underlying runtime guarantees.
