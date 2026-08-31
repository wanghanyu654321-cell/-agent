# Portfolio V1 Thin HTTP API

## Purpose

This adapter gives the Portfolio V1 thin frontend a small HTTP boundary around
the existing `SupportAgentRuntime`. It does not construct a model, resolve
provider credentials, or change Runtime policy. The host application injects a
valid Runtime through the server factory.

For a deterministic local portfolio composition only, run `npm run demo`. That
entrypoint injects deterministic faux Pi actions into the real Runtime and keeps this
HTTP adapter unchanged; see [the demo composition](DEMO_COMPOSITION_V1.md). It is not
a production model-provider or authentication bootstrap.

```text
Portfolio frontend
  -> node:http adapter
    -> SupportRuntimePort
      -> SupportAgentRuntime
        -> Pi Agent and governed product tools
```

## Identity warning

`tenantId`, `storeId`, and `customerId` are accepted from the JSON request
body for the Portfolio demo only.

**DEMO / PORTFOLIO IDENTITY ONLY — NOT PRODUCTION AUTHENTICATION.**

This adapter does not authenticate callers, authorize identities, manage
sessions, or implement CORS. A production deployment needs a separately
scoped authentication and origin-policy design.

## Server factory

```ts
import { createPortfolioHttpServer } from "./src/http-api.ts";

const server = createPortfolioHttpServer(runtime);
server.listen(3000);
```

`runtime` implements the existing `SupportRuntimePort` contract:

```ts
interface SupportRuntimePort {
  run(request: SupportRequest): Promise<SupportResult>;
}
```

The repository intentionally does not provide `npm start`: this phase does not
choose a provider or bootstrap a production Runtime.

## Endpoints

| Method | Path | Result |
| --- | --- | --- |
| `GET` | `/healthz` | `200 { "status": "ok" }`; never invokes the Runtime. |
| `POST` | `/api/v1/support/respond` | Sends a bounded `SupportRequest` to the injected Runtime. |

An unknown route returns `404`. A wrong method for either known route returns
`405` with an `Allow` header. There is no streaming, SSE, WebSocket, multipart,
or CORS protocol in Portfolio V1.

## Request contract

`POST /api/v1/support/respond` accepts JSON with these existing Runtime fields:

```json
{
  "conversationId": "portfolio-conversation-1",
  "tenantId": "demo-tenant",
  "storeId": "demo-store",
  "customerId": "demo-customer",
  "text": "请问营业时间？",
  "permissions": ["handoff:write"],
  "mayEscalate": true,
  "requiresEscalation": false
}
```

Required fields are `conversationId`, `tenantId`, `storeId`, `customerId`, and
`text`; each must be a non-empty string. Optional `permissions` is an array of
strings. Optional `mayEscalate` and `requiresEscalation` are booleans. The
adapter forwards only these fields; Runtime business-policy validation remains
authoritative.

The JSON body limit is **64 KiB**. Invalid JSON, missing fields, or wrong
primitive types return `400`. Bodies above the limit return `413` and are not
accumulated beyond the limit in server memory.

## Response contract

On a successful Runtime call, the adapter returns `200` and only these
Portfolio-facing fields:

```json
{
  "type": "answer",
  "text": "门店每天 09:00-21:00 营业。",
  "piSessionId": "pi-session-id",
  "toolsCalled": ["search_faq"],
  "evidence": [
    {
      "id": "faq-business-hours",
      "kind": "faq",
      "version": "faq-v1",
      "sourceRef": "https://example.invalid/approved-faq"
    }
  ]
}
```

`type` is one of `answer`, `fallback`, or `escalation`. The frontend may render
the text and evidence provenance, but must not infer authorization from the
demo identity fields.

The adapter never serializes `sessionEvents`, raw Pi messages, candidate
evidence bodies that were not final evidence, audit entries, hidden reasoning,
provider payloads, or credentials.

## Error responses

| Status | Body | Meaning |
| ---: | --- | --- |
| `400` | `{ "error": "invalid_request" }` | Invalid JSON or invalid transport shape. |
| `404` | `{ "error": "not_found" }` | Unknown path. |
| `405` | `{ "error": "method_not_allowed" }` | Known path used with an unsupported method. |
| `413` | `{ "error": "request_body_too_large" }` | JSON body exceeds 64 KiB. |
| `500` | `{ "error": "internal_error" }` | Unexpected Runtime failure; no stack or internal error is exposed. |

## Scope boundary

This is an HTTP translation layer only. It does not modify governed knowledge
admission, Safety escalation, FAQ admission, tenant/store policy, audit
semantics, timeout values, retrieval ranking, semantic selection, or Pi
dependencies. It adds no database, ORM, provider router, auth system, admin
system, or third-party web framework.
