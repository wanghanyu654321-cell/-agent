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

- **No secrets.** Every credential, domain, connection string and certificate
  path is a placeholder. Missing prerequisites are execution blockers, not
  license to hard-code real values.
- **No new infrastructure.** The topology stays host Nginx -> loopback-published
  Node -> internal Docker network (FastAPI + PostgreSQL/pgvector). No Kubernetes,
  Redis, Kafka, service mesh or public database port is introduced.
- **BLOCKED, not PASS.** Health/smoke helpers report `BLOCKED` on any missing
  environment; dependency failure is never a successful no-answer.
- **Gap discipline.** The selected WeChat Customer Service protocol now implements only GET URL verification
  (signature, AES decryption, CorpID/receiveId check). POST events, `sync_msg`/`send_msg` and external-customer
  authority remain blocked follow-up work; vector profile selection (GAP-03/04) is unchanged.

## Related support scripts

- `scripts/job-ready-health-smoke.mjs` — unauthenticated liveness/readiness probe.
- `scripts/job-ready-delivery-smoke.mjs` — environment-gated authenticated smoke
  that fails closed to `BLOCKED`.

Deployment evidence is recorded with the templates under
`docs/job-ready/evidence/`.
