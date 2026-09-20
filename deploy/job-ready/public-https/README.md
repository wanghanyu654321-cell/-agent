# Public HTTPS Deployment Closure — frontagent.cn

This runbook wires the already-reviewed application to the Tencent Cloud Ubuntu
host. It does not redesign Runtime, Authority, RAG, AgentProfile, Safety or
business writes.

## Topology

```text
Internet
  -> TCP 80/443
  -> host Nginx
  -> 127.0.0.1:3000
  -> Node app
       -> internal Docker network -> PostgreSQL/pgvector
       -> internal Docker network -> private FastAPI
```

Only Nginx is Internet-facing. The production Compose file binds Node to loopback;
PostgreSQL and FastAPI publish no host ports.

## 1. Host prerequisites

Ubuntu 24.04 LTS, Docker Engine + Compose plugin, Git, Nginx and Certbot.

```bash
sudo apt update
sudo apt install -y nginx certbot
sudo mkdir -p /var/www/letsencrypt
```

Tencent Cloud firewall should allow TCP 22, 80 and 443. Do not open 3000, 5432
or 8000.

## 2. Clone the reviewed branch

For the existing live host, use `/opt/customer-support-agent-public` and Compose
project `customer-support-agent-public`. Do not clone over it or repeat initial
Nginx/ACME/callback setup. After merge, pin the approved main SHA, retain a prior
artifact/image reference, overlay the tracked artifact without host-local secrets,
then build/recreate the app as needed with `compose.production.yaml`. Keep volumes.
Record artifact checksum/version and health/live results; `.git` HEAD alone does
not prove which artifact is running.

The commands below describe first-time bootstrap only; substitute the exact
approved main SHA for `<APPROVED_MAIN_SHA>` before running them on a new host.

```bash
sudo mkdir -p /opt/customer-support-agent-public
sudo chown "$USER":"$USER" /opt/customer-support-agent-public
git clone https://github.com/wanghanyu654321-cell/-agent.git /opt/customer-support-agent-public
cd /opt/customer-support-agent-public
git checkout <APPROVED_MAIN_SHA>
```

Do not deploy uncommitted host edits.

## 3. Create the host-only environment

For a new host, create `/opt/customer-support-agent-public/.env.production` from
`deploy/job-ready/runbook/environment-template.md`. Use strong random URL-safe
credentials and then:

```bash
chmod 600 .env.production
docker compose --env-file .env.production -f compose.production.yaml config >/dev/null
```

The config command must succeed before containers are started.

## 4. Bootstrap ACME over HTTP

```bash
sudo cp deploy/job-ready/public-https/nginx/frontagent.bootstrap.conf /etc/nginx/sites-available/frontagent.cn
sudo ln -sfn /etc/nginx/sites-available/frontagent.cn /etc/nginx/sites-enabled/frontagent.cn
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Verify both DNS names resolve to the host, then request one certificate containing
both SANs:

```bash
sudo certbot certonly --webroot -w /var/www/letsencrypt \
  -d frontagent.cn -d www.frontagent.cn
```

No certificate/private-key bytes belong in Git.

## 5. Start the private application stack

```bash
cd /opt/customer-support-agent-public
docker compose --env-file .env.production -f compose.production.yaml up -d --build
docker compose --env-file .env.production -f compose.production.yaml ps
curl --fail http://127.0.0.1:3000/healthz
```

The loopback health request must return HTTP 200 before Nginx is switched to TLS.

## 6. Enable the final HTTPS edge

```bash
sudo cp deploy/job-ready/public-https/nginx/frontagent.cn.conf /etc/nginx/sites-available/frontagent.cn
sudo nginx -t
sudo systemctl reload nginx
```

Expected edge behavior:

- `http://frontagent.cn/*` -> `https://frontagent.cn/*`
- `https://www.frontagent.cn/*` -> `https://frontagent.cn/*`
- `https://frontagent.cn/healthz` -> HTTP 200
- no direct Internet listener for Node/FastAPI/PostgreSQL

## 7. Public smoke

Use a synthetic demo identity only. Never put real customer data into this
portfolio deployment.

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

For the existing deterministic persistence proof against the public URL:

```bash
DOCKER_DELIVERY_BASE_URL=https://frontagent.cn node scripts/docker-delivery-smoke.mjs write
docker compose --env-file .env.production -f compose.production.yaml down
docker compose --env-file .env.production -f compose.production.yaml up -d
DOCKER_DELIVERY_BASE_URL=https://frontagent.cn node scripts/docker-delivery-smoke.mjs read-after-recreate
```

Do not add `-v`: the named PostgreSQL volume is the persistence under test.

## 8. Certificate renewal and restart

```bash
sudo certbot renew --dry-run
sudo systemctl enable nginx
docker compose --env-file .env.production -f compose.production.yaml restart
```

After a host/container restart, rerun health + authenticated smoke before
recording Deployment Closure.

## 9. Evidence / claim boundary

A successful run supports: real DNS, public HTTPS, host Nginx, loopback-only Node
publication, private FastAPI/PostgreSQL, durable PostgreSQL state across Compose
recreation, and the existing application/eval boundaries.

HTTPS smoke alone does not establish live WeCom delivery. The owner reports a
separate prior ordinary-WeChat E2E validation through the implemented Customer
Service path (see `../README.md`). After updating the live app, request one fresh
test message from the owner and record receipt confirmation plus sanitized
processing evidence. Never automatically replay historical routed rows.

Neither check establishes Production Ready, commercial customer deployment,
SLA/HA, exactly-once delivery, production Data Flywheel, production-calibrated
retrieval quality or MCP. Pagination and reconciliation hardening remain open.
