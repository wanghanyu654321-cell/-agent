# V2.3 Source Audit

- Start commit: `95258ab6eb146c4da56581b75d819e276dd08c1a` on `feat/v2.2-evidence-selection`.
- Frozen tag `customer-support-agent-v2.1.1-eval-integrity` peels to `3e379a66a239285798bde7d02e51485b3f50792d`.
- Pi packages are all pinned to `0.84.3`.

`src/index.ts` remains the only Pi `Agent` runtime. `src/knowledge.ts` supplies approved, tenant/store-admitted Top-3 candidates. Safety consumes raw candidates before any ordinary-business grounding; FAQ has a separate one-candidate admission path. `evals/retrieval/public-benchmark.ts` retains all 62 cases and the V2.2 counterexamples. `evals/selection/score-analysis.ts` and its test retain the deterministic-selector impossibility proof.

Installed Pi AI 0.84.3 declarations document `completeSimple(model, context, options)` as its smallest official one-shot call. V2.3 uses it with no tools, one message, `maxTokens: 32`, `maxRetries: 0`, timeout and AbortSignal. No Pi source is copied or modified.
