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

The one authorized 44-call Gate process started with the frozen provider, model, prompt, benchmark, corpus, and a 15000 ms evaluation-only timeout. It terminated before writing `oauth-aware-semantic-gate-run.json`. The historical runner kept trace state in memory and attempted one direct final `writeFileSync` only after evaluation completion; it did not atomically persist per-call evidence. No complete trace, aggregate metrics, latency distribution, provider-error count, timeout count, or case-level result exists; these values are intentionally recorded as unavailable rather than inferred. The result is **SEMANTIC GATE INFRASTRUCTURE BLOCKED**, not semantic failure.

The subsequent one-time durable Recovery Gate authorization was executed at source HEAD `df9cefdd1d10bb8764658798bbdbec766176e5ce`. It reached neither manifest creation nor semantic completion: its local `git rev-parse HEAD` provenance call was rejected by Git worktree ownership protection before `createDurableSemanticGateAttempt()` runs. Therefore manifest status is absent, journal count is `0`, final-report status is absent, and real semantic calls are exactly `0`. This is **SEMANTIC GATE INFRASTRUCTURE BLOCKED**, not a semantic failure; no retry is authorized. Runtime integration and a V2.3 release tag remain prohibited. The hardened lifecycle remains available only for a separately authorized execution: manifest, per-call fsync-backed journal, contiguous 44-record reconstruction, and no-overwrite atomic derived-report publication. See [GATE_EVIDENCE_DURABILITY.md](GATE_EVIDENCE_DURABILITY.md) and [oauth-aware-semantic-gate-infrastructure-blocked.json](../../evals/selection/semantic/reports/oauth-aware-semantic-gate-infrastructure-blocked.json).

## Recovery-2 outcome

The Git provenance fix was committed as `edb70e6c9d7e5b48defd5e42708e591d337bae4d`, then one recovery-2 process executed from that exact clean source commit. It created the fsynced manifest before call #1 and produced 44 unique durable traces with contiguous sequences `1..44`; the final report was write-once derived from that journal. The frozen provider/model, prompt/hash, benchmark hash, corpus hash, and `15000` ms evaluation timeout all match the manifest and report.

The run is complete and uncontaminated by infrastructure failures: provider errors `0`, timeouts `0`, invalid outputs `0`, wrong selections `0`, and order-induced wrong selections `0`. It fails the frozen quality Gate because correct selection is `0.96`, below `0.98`; the recorded non-selections are `public-04/primary`, `public-04/reversed`, and `public-28/primary`. **SEMANTIC SELECTOR OFFLINE GATE FAILED.** No tuning, rerun, runtime integration, or V2.3 release tag is authorized.

The benchmark-contract audit confirms that only `public-04/primary` and `public-28/primary` affect the 50-case primary `correctSelectionRate`; `public-04/reversed` affects only multi-candidate/order diagnostics. It classifies 9/50 answerable benchmark cases as PARTIAL under the frozen direct-and-sufficient selector contract. Thus the benchmark is **PARTIALLY VALID**, while the frozen Recovery-2 Gate remains **FAILED**. See [BENCHMARK_CONTRACT_AUDIT.md](BENCHMARK_CONTRACT_AUDIT.md).

Audit V2 supersedes Audit V1's consistency interpretation with 37 SUPPORTED and 13 PARTIAL cases. The primary-rate statement remains unchanged: only `public-04/primary` and `public-28/primary` reduce it; `public-04/reversed` is diagnostic. The frozen Recovery-2 Gate remains **FAILED**. See [BENCHMARK_CONTRACT_AUDIT_V2.md](BENCHMARK_CONTRACT_AUDIT_V2.md).
