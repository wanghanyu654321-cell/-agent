# V1.1 Safety Robustness Source Audit

## Baseline verified before V1.1 changes

- Working branch was created from `customer-support-agent-v1-safety` at `9c60fe9a0764bd22a595d13a463b5665899d7c35`.
- `customer-support-agent-runtime-v0` still resolves to `72eadc11a47e4176887607a310e74c242d4a261a`.
- Published Pi dependencies remain exactly pinned to `0.84.3` in `package.json`.
- Repository scan found no vendored Pi Agent, SessionManager, model, or generic tool source.
- Baseline verification: `npm.cmd test` passed 54/54 before V1.1 changes.

## V1 primitives to retain

- `SupportAgentRuntime` in `src/index.ts` remains the single product runtime and the only Pi `Agent` loop owner.
- `detectSafetyRisk`, `ApprovedSafetyRetrievalService`, and `decideSafety` in `src/safety.ts` are the product-owned deterministic safety boundary.
- `search_knowledge` remains the existing RetrievalService-backed tool. It captures actual evidence metadata for safety decisions.
- The existing `InMemorySupportStore` handoff reservation is the sole idempotency boundary for qualified-human handoff.
- `SupportResult.toolsCalled`, Agent events, and `support-agent.audit` are the runtime evidence sources for V1.1 evaluation.
- The existing `safety-escalation` Skill remains workflow-only and cannot provide professional facts.

## Observed V1.1 gaps

1. Detection is direct-keyword oriented and misses many indirect/colloquial risk signals.
2. `evals/safety/runner.ts` invokes detector and policy directly instead of `SupportAgentRuntime`.
3. That runner derives tool traces from disposition and sets unsupported-claim count to a constant.
4. Its 30 cases are repeated templates rather than a robustness corpus.

## V1.1 bounded approach

V1.1 will extend only deterministic normalization and lexical/phrase heuristics, conservatively use `unknown_professional_risk` for strong but uncategorized signals, and replace the evaluator with controlled faux-provider runtime executions. It will not add an LLM classifier, a second Agent/runtime, a database, a vector store, or a Pi source change.
