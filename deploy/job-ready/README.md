# deploy/job-ready — Isolated Delivery Support (Track D)

Isolated, non-wired delivery **support** artifacts authored by Track D
(`job-ready/eval-delivery-v1`). Nothing here is referenced by `compose.yaml`, any
`Dockerfile`, root package files, the GitHub Actions workflow, application code,
Runtime, the RAG algorithm, the React app or shared configuration. **Final
Integration owns all real deployment wiring.**

## Contents

| Path | Purpose |
| --- | --- |
| `nginx/job-ready.example.conf` | Example HTTPS reverse proxy for the section-10 topology. Placeholders only; fronts the Node app, keeps FastAPI + PostgreSQL internal. |
| `runbook/environment-template.md` | Environment variable template. Placeholders only; secrets stay outside Git. |
| `runbook/failure-runbooks.md` | Seven bounded failure runbooks mapped to safe error categories. |

## Hard rules honored here

- **No secrets.** Every credential, domain, connection string and certificate
  path is a placeholder. Missing prerequisites are execution blockers, not
  license to hard-code real values.
- **No new infrastructure.** The topology stays Nginx -> Linux host -> Docker
  Compose (Node app, FastAPI ai-service, PostgreSQL + pgvector). No Kubernetes,
  Redis or Kafka is introduced to look more enterprise.
- **BLOCKED, not PASS.** Health/smoke helpers report `BLOCKED` on any missing
  environment; dependency failure is never a successful no-answer.
- **Gap discipline.** WeCom callback wiring (GAP-01/02) and vector profile
  selection (GAP-03/04) are intentionally left undefined; Integration completes
  them after independent approval.

## Related support scripts

- `scripts/job-ready-health-smoke.mjs` — unauthenticated liveness/readiness probe.
- `scripts/job-ready-delivery-smoke.mjs` — environment-gated authenticated smoke
  that fails closed to `BLOCKED`.

Deployment evidence is recorded with the templates under
`docs/job-ready/evidence/`.
