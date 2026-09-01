# Persistent business boundary (Phase 2B candidate)

`PERSISTENT BUSINESS BOUNDARY = IMPLEMENTATION CANDIDATE`.

Phase 2B persists enterprise business records without replacing Pi's session engine:

```text
Authenticated session
  -> SupportExecutionContext (tenant/store + capabilities)
  -> EnterpriseSupportService
  -> SupportAgentRuntime
  -> optional SupportBusinessStore
  -> PostgreSQL business records
```

## Conversation ownership

`EnterpriseSupportService` resolves `conversationId` plus `customerId` before Runtime
execution. A new conversation is inserted in the authenticated tenant/store. A same-scope
conversation may continue only for the same customer. A cross-scope conversation returns a
generic not-found error and a same-scope customer rebind is rejected.

## Database enforcement

`002_support_business_persistence.sql` adds `(id, tenant_id, store_id)` conversation
addressability and composite foreign keys from tickets, handoffs, and non-null conversation
audit records. A record cannot link Tenant A / Store A1 to a conversation in Tenant B /
Store B1. Ticket idempotency remains `UNIQUE (tenant_id, idempotency_key)`. Handoffs use
`UNIQUE (tenant_id, store_id, conversation_id)`, replacing the unsafe global conversation
uniqueness from Phase 2A.

## Runtime persistence port

`SupportAgentRuntime` retains `InMemorySupportStore` for Pi session mappings and existing
deterministic behavior. Its optional `SupportBusinessStore` is only for ticket, handoff,
and the existing structured `support-agent.audit` payload. PostgreSQL is never passed into
the Runtime as a `Pool` and retrieval, FAQ, Safety, and semantic routing do not depend on
the database.

Ticket and handoff writes await durable confirmation. PostgreSQL `ON CONFLICT` is the final
authority for concurrent duplicate side effects. If a durable side effect fails, the tool
fails rather than claiming it succeeded. If audit persistence fails after a confirmed side
effect, the request fails closed; a retry sees the durable duplicate and no distributed
transaction, retry worker, or outbox is claimed.

Safety escalation retains its stronger precedence: it creates the qualified-human handoff
through the same durable port even when ordinary caller-driven handoff capability is absent.

## Read surface

`GET /api/v1/conversations`, `/tickets`, and `/handoffs` require `conversation:read` and
always use tenant/store from the authenticated session. `GET /api/v1/audit-events` requires
`audit:read` (admin only). `tenantId` and `storeId` query parameters are rejected; no body
or query value can widen scope.

| Role | Conversations / tickets / handoffs | Audit events |
| --- | --- | --- |
| agent | allowed in own tenant/store | forbidden |
| supervisor | allowed in own tenant/store | forbidden |
| admin | allowed in own tenant/store | allowed in own tenant/store |

## Pi session versus business persistence

PostgreSQL stores business identity, records, and an optional `pi_session_id` reference.
Pi `SessionManager` remains the owner of full Agent session/message state. Phase 2B does
not claim full conversational-memory recovery across process reconstruction.

## Scope boundary

This candidate does not add React, SSE, a public event stream, an ORM, Redis, pgvector,
MCP, external integrations, new model evaluation, or a second Agent Runtime. Before any
Phase 2C persistence claim involving richer conversation-linked business data, database
ownership constraints must remain tenant/store-consistent at the record boundary.
