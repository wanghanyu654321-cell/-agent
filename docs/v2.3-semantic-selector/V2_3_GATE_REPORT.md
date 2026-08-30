# V2.3 Gate Report

## Code-side evidence

- Strict selector parser and one-shot Pi completion adapter: PASS in unit tests.
- OAuth-aware evaluator and diagnostics use public Coding Agent `ModelRuntime`, `checkAuth`, `getModel`, and injected `completeSimple`; no manual credential access occurs.
- Pi `error` envelopes now fail closed to `ABSTAIN/provider_error`; Pi `aborted` envelopes fail closed to `ABSTAIN/timeout` before parsing.
- Successful `stop` and `length` envelopes parse only final text. Empty and thinking-only successful envelopes remain invalid; thinking is never selector output.
- Provider failure, malformed output, unknown labels, cancellation and timeout: fail closed to `ABSTAIN`.
- Runtime integration: intentionally not attempted; the V2.3 contract forbids it before a valid real-model offline Gate.

## Blocking Gate

Provider call path: **VALIDATED**. The one-call public `ModelRuntime` control resolved stored OAuth and returned `stopReason: "stop"` in 2962 ms with one text block, non-zero output usage, and a response ID. Its historical sanitized report did not capture `textMatchesExpectedControl`, so it cannot establish the exact control response.

## OAuth-aware semantic Gate execution

The one authorized 44-call Gate process started with the frozen provider, model, prompt, benchmark, corpus, and a 15000 ms evaluation-only timeout. It terminated before writing `oauth-aware-semantic-gate-run.json`. No complete trace, aggregate metrics, latency distribution, provider-error count, timeout count, or case-level result exists; these values are intentionally recorded as unavailable rather than inferred. The result is **SEMANTIC GATE INFRASTRUCTURE BLOCKED**, not semantic failure. No rerun, runtime integration, or V2.3 release tag is authorized. See [oauth-aware-semantic-gate-infrastructure-blocked.json](../../evals/selection/semantic/reports/oauth-aware-semantic-gate-infrastructure-blocked.json).
