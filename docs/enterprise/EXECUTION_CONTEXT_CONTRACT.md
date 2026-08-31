# Support execution context contract

`SupportExecutionContext` is the enterprise application boundary in front of the
unchanged `SupportAgentRuntime`:

```ts
interface SupportExecutionContext {
  actor: { userId: string; role: Role; capabilities: Capability[] };
  scope: { tenantId: string; storeId: string };
  request: { requestId: string };
}
```

The enterprise HTTP server resolves it only from the `HttpOnly` session cookie,
server-side `auth_sessions`, the user, and exactly one membership. If a user has no
membership or more than one membership, the server fails authentication rather than
selecting a tenant/store from browser input.

For `POST /api/v1/support/respond`, browser fields `tenantId`, `storeId`, `role`, and
`permissions` are ignored as authority. The server derives legacy Runtime fields from
the context: `ticket:create` maps to `tickets:write`; `handoff:create` maps to
`handoff:write` and `mayEscalate=true`. This adapter preserves the current Runtime's
existing authorization semantics without changing its API or persistence model.

`customerId`, `conversationId`, and text remain request payload data in Phase 2A. Their
tenant-scoped persistent ownership is deferred to Phase 2B. The existing demo HTTP
adapter remains demo-only and backwards compatible; enterprise authentication is exposed
by the separate `createEnterpriseHttpServer()` boundary.
