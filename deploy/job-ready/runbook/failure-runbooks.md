# Job-Ready Failure Runbooks — ISOLATED Track D support file

Bounded operator runbooks for the thin production-like topology (Directive
section 10). They are **support material only**: they do not change application
code, Runtime, the RAG algorithm, `compose.yaml`, `Dockerfile` or any workflow.
Final Integration owns real wiring and any production change.

Ground rules for every runbook:

- A missing dependency or environment is **BLOCKED, not PASS**.
- **Dependency failure is never a successful zero-match / no-answer.** Retrieval
  or DB unavailability must surface as failure, not as an empty answer.
- Diagnostics must **not** print secrets, raw corpus content, credentials,
  customer PII, hidden reasoning or provider payloads.
- Record the safe structured fields only (`requestId`, opaque `conversationId`,
  opaque tenant/store ids, `channel`, latencies, `resultType`, bounded
  `errorCategory`, `toolsCalled`, `evidenceCount`).

---

## 1. Nginx / Node app unavailable

- **Symptoms:** Public HTTPS returns 502/503/504 or connection refused;
  `scripts/job-ready-health-smoke.mjs` prints `BLOCKED`.
- **Safe diagnosis:** Verify Nginx is running and its upstream target matches
  `NODE_APP_PORT`; check the Node container is up; confirm TLS material paths
  exist. Do not dump certificate contents.
- **Bounded mitigation:** Reload Nginx after config correction; restart the Node
  container; re-run the health smoke. If the edge is up but the app is not, treat
  as an app incident (section 2/3/6).
- **Safe error category:** edge/`dependency_unavailable` at the proxy; the app
  itself reports nothing while down.
- **Escalation & evidence:** Capture health-smoke output (BLOCKED), proxy status
  line, and container state. Health must return HTTP 200 before claiming recovery.

## 2. PostgreSQL unavailable

- **Symptoms:** Authenticated requests fail; identity/business reads error;
  health may stay up while scoped queries fail.
- **Safe diagnosis:** Confirm the internal DB service is reachable from the Node
  app on the compose network; check migration ledger state. Never log
  `DATABASE_URL` or query text.
- **Bounded mitigation:** Restore the DB service; verify persistent volume
  reattachment; re-run the delivery smoke. Restarting PostgreSQL alone does
  **not** establish full conversational (Pi-session) memory recovery — preserve
  that limitation in any evidence.
- **Safe error category:** `dependency_unavailable`.
- **Escalation & evidence:** Record restart-persistence check (write, recreate,
  read-back) per durable component; BLOCKED until scoped reads succeed.

## 3. FastAPI ai-service unavailable

- **Symptoms:** Vector retrieval or embedding-backed paths fail while lexical
  paths may still work; new non-Runtime service dependency returns HTTP 503.
- **Safe diagnosis:** Confirm `AI_SERVICE_URL` resolves on the internal network;
  check the ai-service container health. Do not log request/response bodies.
- **Bounded mitigation:** Restart the ai-service; if `RETRIEVAL_MODE=vector` and
  the service is down, retrieval must fail closed (see section 4), not silently
  fall back to an unapproved mode.
- **Safe error category:** `provider_unavailable` / HTTP 503 for the new
  non-Runtime dependency.
- **Escalation & evidence:** Capture ai-service health and the resulting bounded
  `errorCategory`; no invented answer text.

## 4. Retrieval unavailable

- **Symptoms:** Retrieval call errors or times out; no governed evidence can be
  established.
- **Safe diagnosis:** Distinguish transport failure from a legitimate empty
  result. An empty admitted set with a healthy call is a real no-answer; an error
  is **not**.
- **Bounded mitigation:** Retry within bounded policy; if still unavailable, the
  request yields the controlled internal failure, never a fabricated answer.
- **Safe error category:** internal / FastAPI 503 `retrieval_unavailable`.
- **Escalation & evidence:** In eval terms, an `unavailable` measurement is a
  dependency failure and is **never** counted as a correct no-answer
  (`evals/job-ready-rag/metrics.ts`).

## 5. WeCom callback blocked

- **Symptoms:** Inbound channel events do not arrive or are not acknowledged.
- **Safe diagnosis:** This area is gated by **CONTRACT GAP-01** (official WeCom
  API family / wire callback / ack / egress) and **GAP-02** (employee vs
  external-customer mapping). Do not guess a wire contract or provision real
  channel bindings.
- **Bounded mitigation:** Confirm network/allow-list reachability only; defer
  protocol behavior to Integration after the gaps are independently approved.
- **Safe error category:** channel ingress failure; successful dedupe of a
  replayed event is **not** a second execution.
- **Escalation & evidence:** Record that the callback path is GAP-blocked; no
  live adapter claim.

## 6. Runtime timeout

- **Symptoms:** A request exceeds its deadline; partial work may exist.
- **Safe diagnosis:** Inspect bounded latency fields (total / retrieval / agent /
  db) without asserting their sum equals total. Agent time includes Pi overhead
  and is not pure model time.
- **Bounded mitigation:** Honor `AbortSignal`; discard late responses; return the
  existing safe result contract. Preserve mandatory Safety retry semantics.
- **Safe error category:** `upstream_timeout`.
- **Escalation & evidence:** In eval latency stats, timeouts are counted
  separately and are never disguised as success-only latency.

## 7. Vector profile unavailable

- **Symptoms:** `RETRIEVAL_MODE=vector` selected but no approved embedding
  profile / pgvector build is present or compatible.
- **Safe diagnosis:** This is gated by **CONTRACT GAP-03** (pinned embedding
  artifact/model/revision/dimension/location/data-egress profile + compatible
  pgvector build) and **GAP-04** (profile-specific relevance floor + calibration
  provenance).
- **Bounded mitigation:** Do not run vector retrieval without an approved
  profile; do not use unconditional nearest-neighbour as a no-answer policy. Keep
  the run BLOCKED, or use the approved lexical path if independently authorized.
- **Safe error category:** configuration/`dependency_unavailable` for the vector
  profile.
- **Escalation & evidence:** Record the missing profile id as a prerequisite; no
  vector quality claim and no GAP-05 PASS label.
