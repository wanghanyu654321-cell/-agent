# Job-Ready Environment Template — ISOLATED Track D support file

Template only. **Every value below is a placeholder.** Real credentials, domains,
connection strings and certificates must stay **outside Git** (secret manager or
host env file with restricted permissions). The Job-Ready directive is explicit:
missing deployment credentials, domain, database or store timezone are execution
prerequisites, **not** permission to hard-code real values.

Copy to a host-local `.env` (never committed) and fill in per environment.

## 1. Public edge / TLS (Nginx)

| Variable | Meaning | Example placeholder |
| --- | --- | --- |
| `DOMAIN` | Public HTTPS host name | `<DOMAIN>` |
| `NODE_APP_PORT` | Host-published port of the Node enterprise app | `<NODE_APP_PORT>` |
| `TLS_FULLCHAIN_PEM_PATH` | Absolute path to the TLS full-chain PEM | `<TLS_FULLCHAIN_PEM_PATH>` |
| `TLS_PRIVKEY_PEM_PATH` | Absolute path to the TLS private key PEM | `<TLS_PRIVKEY_PEM_PATH>` |
| `PROXY_READ_TIMEOUT_S` | Nginx upstream read timeout (seconds) | `<PROXY_READ_TIMEOUT_S>` |

## 2. Node enterprise app

| Variable | Meaning | Example placeholder |
| --- | --- | --- |
| `NODE_ENV` | Runtime mode | `production` |
| `PORT` | In-container listen port | `<PORT>` |
| `DATABASE_URL` | PostgreSQL connection string (secret) | `<DATABASE_URL>` |
| `AI_SERVICE_URL` | Internal FastAPI ai-service base URL | `<AI_SERVICE_URL>` |
| `RETRIEVAL_MODE` | `lexical` or `vector` (vector requires GAP-03 profile) | `lexical` |
| `STORE_DEFAULT_TIME_ZONE` | Explicit IANA store timezone (execution prerequisite) | `<STORE_DEFAULT_TIME_ZONE>` |

## 3. PostgreSQL + pgvector (internal only)

| Variable | Meaning | Example placeholder |
| --- | --- | --- |
| `POSTGRES_DB` | Database name | `<POSTGRES_DB>` |
| `POSTGRES_USER` | Application DB role | `<POSTGRES_USER>` |
| `POSTGRES_PASSWORD` | Application DB password (secret) | `<POSTGRES_PASSWORD>` |
| `POSTGRES_HOST` | Internal compose service host | `<POSTGRES_HOST>` |
| `POSTGRES_PORT` | Internal compose service port | `<POSTGRES_PORT>` |

The database is on the internal compose network and must **not** be published to
the public edge. Python index-write roles are isolated from Node authority tables
by DB grants (owned by Integration).

## 4. FastAPI ai-service (internal only)

| Variable | Meaning | Example placeholder |
| --- | --- | --- |
| `AI_SERVICE_PORT` | Internal ai-service port | `<AI_SERVICE_PORT>` |
| `EMBEDDING_PROFILE_ID` | Approved embedding artifact/profile id — **GAP-03 pending** | `<EMBEDDING_PROFILE_ID>` |

Do not select `RETRIEVAL_MODE=vector` until CONTRACT GAP-03 (pinned embedding
artifact/model/revision/dimension/location/data-egress profile + compatible
pgvector build) is independently approved.

## 5. WeCom channel — GAP-01 / GAP-02 pending

No WeCom environment keys are templated here on purpose. CONTRACT GAP-01
(official WeCom API family / wire callback / ack / egress contract) and GAP-02
(employee vs external-customer mapping) are unresolved; inventing configuration
keys would pre-empt those independent decisions. Integration adds them after
approval.

## 6. Smoke helpers (`scripts/job-ready-*.mjs`)

| Variable | Meaning | Example placeholder |
| --- | --- | --- |
| `JOB_READY_BASE_URL` | Public base URL to probe | `<JOB_READY_BASE_URL>` |
| `JOB_READY_HEALTH_TIMEOUT_MS` | Health wait deadline (ms) | `60000` |
| `JOB_READY_HEALTH_INTERVAL_MS` | Health poll interval (ms) | `500` |
| `JOB_READY_SMOKE_EMAIL` | Delivery-smoke login email (secret) | `<JOB_READY_SMOKE_EMAIL>` |
| `JOB_READY_SMOKE_PASSWORD` | Delivery-smoke login password (secret) | `<JOB_READY_SMOKE_PASSWORD>` |
| `JOB_READY_SMOKE_EXPECT_TENANT` | Expected tenant scope for the smoke identity | `<JOB_READY_SMOKE_EXPECT_TENANT>` |
| `JOB_READY_SMOKE_EXPECT_STORE` | Expected store scope for the smoke identity | `<JOB_READY_SMOKE_EXPECT_STORE>` |
| `JOB_READY_SMOKE_CONVERSATION_ID` | Optional opaque conversation id | `job-ready-delivery-smoke` |
| `JOB_READY_SMOKE_PROMPT` | Optional prompt; unset skips the respond probe | _(unset)_ |

When any required smoke variable is missing, the helpers print `BLOCKED` and exit
non-zero. **BLOCKED is never reported as PASS.**
