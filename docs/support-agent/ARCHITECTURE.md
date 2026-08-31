# Customer Support Agent Architecture

This repository is the product source of truth for Customer Support Agent Runtime V0. Pi is an upstream runtime dependency and a read-only engineering reference.

```text
SupportRequest
  -> SupportAgentRuntime
       -> Pi Agent and Pi session APIs
       -> four product-owned business tools
       -> product-owned RetrievalService, session mapping, and audit metadata
  -> output guard
  -> answer | escalation | controlled fallback
```

## Ownership boundary

- This repository owns `src/index.ts`, the four support tools, retrieval abstraction, support-session mapping, policy guards, Skills, tests, and product documentation.
- Pi owns the generic Agent loop, provider/model contracts, TypeBox tool execution path, JSONL `SessionManager`, and Skills loader.
- The runtime consumes Pi only through published public package exports. It contains no copied Pi Agent, SessionManager, model, or generic tool runtime source.

## Runtime guarantees

`SupportAgentRuntime` uses real Pi `Agent` execution with `maxAgentTurns`, `maxToolCalls`, overall-turn abort, per-tool abort, and sequential tool execution. It persists Pi messages and a `support-agent.audit` custom entry through Pi `SessionManager`.

The only customer-facing tools are `search_faq`, `search_knowledge`, `create_ticket`, and `handoff_to_human`. FAQ and knowledge retrieval are read-only. Ticket and human-handoff side effects are authorization-gated and protected by in-memory reservations for duplicate and concurrent requests.

The output guard fails closed for missing evidence, unsupported factual support claims, empty or failed provider output, unsafe completion promises, required escalation, invalid tool arguments, and timeout or limit outcomes.

## V2.3.1 bounded runtime evidence routing

The implemented ordinary-knowledge route in `search_knowledge` performs
governed admission before constructing a Pi tool result: zero admitted
candidates fail closed; one uses the existing governed single-evidence path;
two or more are ambiguous and expose no ordinary evidence body to Pi. Safety
continues to extract its evidence from raw retrieval output and retains higher
final-result precedence. FAQ retains its separate pre-model admission path.

The runtime adds non-sensitive `support-agent.audit.knowledgeRouting` metadata
for ordinary knowledge. It distinguishes a routing-stage eligible candidate
from evidence actually used by the final `SupportResult`, so an ordinary
candidate can be eligible but unauthorized when Safety or handoff precedence
wins. The semantic selector remains offline: its measured
`openai-codex/gpt-5.6-sol` path is not authorized as a mandatory synchronous
dependency under the unchanged `10000ms` overall-turn and `2000ms` per-tool
budgets. See [V2_3_1_RUNTIME_ROUTING_IMPLEMENTATION_REPORT.md](../v2.3-semantic-selector/V2_3_1_RUNTIME_ROUTING_IMPLEMENTATION_REPORT.md).

## Skills and retrieval

Business Skills live in `skills/`. Matching instructions are loaded server-side by Pi's public Skills API; no filesystem or generic mutation tool is exposed to a customer conversation. `RetrievalService` accepts an `AbortSignal`, so timeout cancellation reaches the retrieval implementation. `InMemoryRetrievalService` is the deterministic V0 backend; no vector infrastructure is included.

See [Pi integration](../architecture/PI_INTEGRATION.md) and the [extraction manifest](../extraction/EXTRACTION_MANIFEST.md).
