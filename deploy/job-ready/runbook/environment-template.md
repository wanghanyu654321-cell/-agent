# Public HTTPS Deployment Environment Template

Template only. Real values belong in a host-local `.env.production` with restrictive
permissions and must never be committed.

The production compose contract is `compose.production.yaml`. Required values use
Compose fail-fast interpolation so a missing secret or deployment prerequisite blocks
startup.

## Host-local `.env.production`

```dotenv
# PostgreSQL — choose a URL-safe strong password so the same value can be used in DATABASE_URL.
POSTGRES_DB=customer_support_agent
POSTGRES_USER=customer_support_agent
POSTGRES_PASSWORD=<STRONG_URL_SAFE_PASSWORD>
DATABASE_URL=postgresql://customer_support_agent:<STRONG_URL_SAFE_PASSWORD>@postgres:5432/customer_support_agent

# Public app composition.
NODE_APP_PORT=3000
STOREOPS_TIME_ZONE=Asia/Shanghai
ENTERPRISE_RUNTIME_MODE=deterministic
ENTERPRISE_KNOWLEDGE_MODE=portfolio
ENTERPRISE_RETRIEVAL_MODE=lexical
ENTERPRISE_SECURE_COOKIES=true

# WeChat Customer Service live channel. All four values are required by production Compose.
# Generate Token and EncodingAESKey
# in kf.weixin.qq.com; keep them host-local and never paste them into Git/logs/issues.
WECOM_CORP_ID=<WECHAT_CUSTOMER_SERVICE_CORP_ID>
WECOM_CALLBACK_TOKEN=<GENERATED_CALLBACK_TOKEN>
WECOM_CALLBACK_AES_KEY=<GENERATED_43_CHAR_ENCODING_AES_KEY>
# Customer Service API secret for access-token acquisition, sync_msg and send_msg.
WECOM_KF_SECRET=<WECHAT_CUSTOMER_SERVICE_API_SECRET>

# Private FastAPI service. It is never published to the host.
RAG_SERVICE_CREDENTIAL=<RANDOM_PRIVATE_SERVICE_CREDENTIAL>
RAG_DATABASE_URL=postgresql://customer_support_agent:<STRONG_URL_SAFE_PASSWORD>@postgres:5432/customer_support_agent
RAG_EMBEDDING_MODE=deterministic
RAG_EMBEDDING_PROFILE=deterministic-test-1536-v1
RAG_CORPUS_CLASSIFICATION=public-synthetic
RAG_INGEST_TIMEOUT_SECONDS=5

# Leave unset/empty for the current deterministic + lexical public portfolio deployment.
PI_PROVIDER=
PI_MODEL=
# Optional, only for the separately accepted pi-real DeepSeek rollout. Never publish a real value.
DEEPSEEK_API_KEY=
```

Use `chmod 600 .env.production`. Do not paste its contents into issues, logs,
screenshots, README files, or deployment evidence.

The current public portfolio deployment deliberately remains
`ENTERPRISE_RUNTIME_MODE=deterministic` and `ENTERPRISE_RETRIEVAL_MODE=lexical`.
That preserves the already-reviewed deterministic demo behavior and does not turn
public hosting into a real-provider or retrieval-quality claim.

## Public smoke variables

The existing environment-driven smoke can verify the real HTTPS edge without
hard-coding credentials:

```bash
export JOB_READY_BASE_URL=https://frontagent.cn
export JOB_READY_REQUIRE_HTTPS=true
export JOB_READY_HTTP_REDIRECT_URL=http://frontagent.cn
export JOB_READY_CANONICAL_HTTPS_URL=https://frontagent.cn
export JOB_READY_SMOKE_EMAIL=<DEMO_EMAIL>
export JOB_READY_SMOKE_PASSWORD=<DEMO_PASSWORD>
export JOB_READY_SMOKE_EXPECT_TENANT=<EXPECTED_TENANT>
export JOB_READY_SMOKE_EXPECT_STORE=<EXPECTED_STORE>
node scripts/job-ready-delivery-smoke.mjs
```

With `JOB_READY_REQUIRE_HTTPS=true`, the smoke requires:
- an HTTPS base URL;
- HSTS and `X-Content-Type-Options: nosniff` at the edge;
- an authenticated session cookie with `HttpOnly`, `SameSite=Strict`, and
  `Secure`;
- optional HTTP-to-canonical-HTTPS redirect verification when the two redirect
  variables are supplied.

## Claim boundary

This environment is a public HTTPS portfolio deployment using synthetic demo
identity/data. The live WeChat Customer Service path is implemented; the owner
reports prior ordinary-WeChat E2E validation (see `../README.md`). A fresh
post-merge live regression remains a separate deployment check. This does not
establish production IAM, a production SLA, production Data Flywheel, MCP,
retrieval-quality acceptance, exactly-once delivery or production-scale reliability.
Pagination and reconciliation hardening remain future work.
