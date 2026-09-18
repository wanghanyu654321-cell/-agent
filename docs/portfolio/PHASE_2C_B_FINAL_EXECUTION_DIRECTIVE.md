# Phase 2C-B Final Execution Directive — Thin Docker Delivery Closure

Status: **SUCCESSOR DELIVERY CANDIDATE**

Repository: `wanghanyu654321-cell/-agent`

Successor branch: `feat/phase-2c-docker-delivery`

Base branch: `feat/phase-2c-product-workspace`

Approved source base: `746b90e7a2548c764e344f87a48442af9c0bc6f5`

Phase 2C-B is a delivery-only successor to the independently approved Phase 2C-A
product workspace. It must not alter the approved product semantics.

## Delivery contract

The supported local delivery topology is exactly:

```text
Browser
  -> app:3000 (React static delivery + existing Enterprise HTTP API)
  -> postgres:16-alpine (named local volume)
```

`app` receives only its existing `DATABASE_URL`, `HOST=0.0.0.0`, and `PORT=3000`
configuration. Application startup continues to use `npm run start:enterprise`.
It connects to PostgreSQL, applies the existing approved migrations, repeat-safely
seeds four synthetic demo identities, composes the existing repositories/services/
Runtime/HTTP server, and supports clean shutdown.

The image must include the existing runtime source, migrations, Skills, production
runtime dependencies, and built `web/dist` artifact. Node is pinned to a Node 22.19
compatible runtime. PostgreSQL has a healthcheck, and Compose starts `app` only after
that healthcheck passes.

## Persistence proof

The HTTP-only `scripts/docker-delivery-smoke.mjs` performs two bounded phases:

1. First startup: health, Alice login and `/auth/me`, a governed FAQ, a Ticket
   support request, Alice scoped Ticket read-back, and Bob cross-tenant denial by
   absence from his scoped results.
2. Recreation without volume deletion: Alice reauthentication and Ticket
   read-back, then Ava's public-safe Audit read-back without raw payloads or Agent
   internals.

The existing GitHub `Customer Support Agent Gate` runs this smoke after the already
required integrity, unit/runtime, PostgreSQL, build, check, Safety, Knowledge, and
Retrieval gates. Cleanup removes the CI volume only after the proof is complete.

## Frozen boundaries

This successor must not modify:

- `src/index.ts`, Safety, Knowledge, semantic selector, four-tool contracts, or
  Pi ownership;
- Enterprise HTTP/auth/identity/business/demo-data/product runtime semantics;
- approved migrations, tenant/store authority, PostgreSQL scoped constraints, or
  React product behavior;
- historical evaluation inputs, frozen evidence, immutable tags, or prior PRs.

It adds no Redis, queue, vector database, MCP, model/provider service, reverse
proxy, observability stack, Python service, Docker Compose service beyond `app` and
`postgres`, external model call, semantic-selector invocation, release, tag, or
merge.

## Required evidence and limits

The authoritative delivery proof is a fresh clean-runner on the successor Draft PR.
Local Docker may be unavailable; that condition must be reported rather than
replaced by an in-memory or direct-SQL proof. The synthetic identities and credentials
are demonstration-only and are never a production authentication claim.

Independent review remains required. This document does not authorize merging,
tagging, releasing, marking a PR ready for review, production deployment, real model
execution, a store pilot, or any next phase.
