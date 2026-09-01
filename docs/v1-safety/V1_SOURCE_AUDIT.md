# V1 Safety Source Audit

V1 is additive to frozen V0 tag `customer-support-agent-runtime-v0` at `72eadc11a47e4176887607a310e74c242d4a261a`.

## Reused V0 primitives

- `SupportAgentRuntime` remains the only customer-support runtime and Pi Agent loop owner.
- `RetrievalService` remains the only retrieval interface and already propagates `AbortSignal`.
- `search_knowledge` remains the retrieval tool; V1 does not add a generic tool registry or a second agent loop.
- `InMemorySupportStore` ticket/handoff reservations remain the side-effect idempotency boundary.
- Pi `SessionManager.appendCustomEntry` remains the single audit path through `support-agent.audit`.
- The existing output guard and exact four-tool allowlist remain in force.

## V1 addition boundary

V1 adds product-owned safety contracts, deterministic evidence/disposition policy, approved-knowledge retrieval data, a process-only Skill, deterministic evals, and audit fields. It does not add professional facts, a database, a vector store, a provider router, or Pi source.
