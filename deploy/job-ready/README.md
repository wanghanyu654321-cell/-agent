# deploy/job-ready — Delivery and Public HTTPS Closure

The original Track D support artifacts remain for provenance. Public HTTPS
Deployment Closure adds a concrete host-Nginx configuration for `frontagent.cn`
plus a production Compose contract. Runtime, Authority, RAG answerability, Safety,
AgentProfile and business semantics are not redesigned here.

## Contents

| Path | Purpose |
| --- | --- |
| `nginx/job-ready.example.conf` | Historical generic reverse-proxy example. |
| `public-https/nginx/frontagent.bootstrap.conf` | HTTP-only ACME bootstrap for first certificate issuance. |
| `public-https/nginx/frontagent.cn.conf` | Final HTTPS edge: canonical host redirect, TLS, bounded rate limits, security headers, Node-only proxy. |
| `public-https/README.md` | Exact bounded deployment procedure for the current Tencent Cloud Ubuntu host. |
| `runbook/environment-template.md` | Actual production Compose/env contract; secrets stay outside Git. |
| `runbook/failure-runbooks.md` | Bounded failure runbooks mapped to safe error categories. |

## Hard rules honored here

- **No secrets.** Credentials and connection strings use placeholders; the public
  domain and certificate paths describe the deployed topology. Missing prerequisites are execution blockers, not
  license to hard-code real values.
- **No new infrastructure.** The topology stays host Nginx -> loopback-published
  Node -> internal Docker network (FastAPI + PostgreSQL/pgvector). No Kubernetes,
  Redis, Kafka, service mesh or public database port is introduced.
- **BLOCKED, not PASS.** Health/smoke helpers report `BLOCKED` on any missing
  environment; dependency failure is never a successful no-answer.
- **Gap discipline.** GET and POST callback verification, `kf/sync_msg`, durable
  inbound claim, dedupe/conflict detection, server-side authority routing,
  governed Agent execution and `kf/send_msg` are implemented. Routing uses
  `wecom_kf_channels` and membership-derived tenant/store/capabilities, never
  external customer identity alone.
- Sync remains single-page (`limit=1000`); `has_more` and `next_cursor` are parsed.
  Full pagination, cursor reconciliation, historical routed replay/backfill and
  outbound indeterminate reconciliation remain future work. Invalid/expired
  access tokens refresh once; unknown send results must not be blindly retried.

## Live evidence and claim boundary

The owner reports a real ordinary-WeChat E2E validation on the live feature:
ordinary WeChat user -> WeChat Customer Service -> FrontAgent -> governed Agent
execution -> `send_msg` -> ordinary WeChat user. This prior observation is
separate from the fresh post-merge deployment regression, which must record
the deployed artifact/version and the owner's receipt confirmation.

This is not an exactly-once, full reliability, production-scale, commercial
deployment or production-readiness claim. `pi-real` production enablement,
Booking Staff HITL, Douyin/Meituan, hosted embedding acceptance and retrieval
quality acceptance are not established by live channel wiring.

The existing deployment is `/opt/customer-support-agent-public`, Compose project
`customer-support-agent-public`, using `compose.production.yaml`. Preserve its
host-local credentials, domain, Nginx, HTTPS and callback configuration. Record
the previous artifact before overlay/recreation; never delete production volumes.
Production `.git` HEAD alone is not deployed-version evidence.

## Related support scripts

- `scripts/job-ready-health-smoke.mjs` — unauthenticated liveness/readiness probe.
- `scripts/job-ready-delivery-smoke.mjs` — environment-gated authenticated smoke
  that fails closed to `BLOCKED`.

Deployment evidence is recorded with the templates under
`docs/job-ready/evidence/`.
