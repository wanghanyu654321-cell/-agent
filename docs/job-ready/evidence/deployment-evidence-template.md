# Deployment Evidence — TEMPLATE (Track D)

Record deployment evidence here **only** after an authorized deployment. Copy to a
dated file (for example `deployment-<environment>-<date>.md`). Keep every
credential, domain and connection value **out of Git**; reference the host env
template instead of pasting values.

Deployment evidence must **distinguish** the five levels below. Passing one is
not evidence of another. **BLOCKED is never PASS.**

## 0. Identity

| Field | Value |
| --- | --- |
| Environment | `<local-docker \| hosted-staging \| hosted-prod>` |
| `sourceCommit` / image digest | `<sha>` / `<digest>` |
| Topology | Nginx -> Linux host -> Docker Compose (Node app, FastAPI ai-service, PostgreSQL + pgvector) |
| Operator / date | `<name / date>` |

## 1. Local Docker

- [ ] Compose stack starts; all services report healthy.
- [ ] `scripts/job-ready-health-smoke.mjs` prints `PASS` against the local base URL.
- Command + output (no secrets):

```text
<command>
<output>
```

## 2. Hosted TLS reachability

- [ ] Public HTTPS resolves for `<DOMAIN>` with a valid certificate chain.
- [ ] HTTP redirects to HTTPS; `healthz` returns HTTP 200 through the edge.
- Evidence (status lines only, no certificate contents):

```text
<command>
<output>
```

## 3. Database restart persistence

- [ ] Write -> recreate/ restart -> read-back succeeds for each durable component.
- [ ] Persistent volume reattaches; migration ledger state is intact.
- **Limitation (must be preserved):** restarting PostgreSQL alone does **not**
  establish full conversational (Pi-session) memory recovery. State explicitly
  what was and was not recovered.
- Evidence:

```text
<command>
<output>
```

## 4. Index readiness

- [ ] Retrieval index is populated and queryable for the deployed scope(s).
- [ ] `RETRIEVAL_MODE` = `lexical` (default) OR `vector` with an approved GAP-03
      `embeddingProfileId` = `<profile-id>`.
- [ ] Vector mode is **not** claimed unless GAP-03/GAP-04 are independently approved.
- Evidence:

```text
<command>
<output>
```

## 5. Real channel / provider success

- [ ] WeCom channel success is recorded **only** if GAP-01/GAP-02 are approved and
      the run is separately authorized; otherwise mark **BLOCKED (GAP-01/02)**.
- [ ] Provider-backed paths exercised with bounded, safe structured records only.
- Evidence or BLOCKED reason:

```text
<command or BLOCKED reason>
```

## 6. Safe-evidence attestation

- [ ] No secrets, raw corpus content, customer PII, hidden reasoning or provider
      payloads are included.
- [ ] Only safe fields (`requestId`, opaque `conversationId`, opaque tenant/store
      ids, `channel`, latencies, `resultType`, bounded `errorCategory`,
      `toolsCalled`, `evidenceCount`) are shown.
- [ ] No merge / tag / release / Ready / Pilot / autonomous-reply claim is made
      from this evidence alone.
