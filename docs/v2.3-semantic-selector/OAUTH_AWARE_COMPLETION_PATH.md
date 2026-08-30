# V2.3 OAuth-Aware Pi Completion Path

## Scope and starting point

This checkpoint starts at `914c903f74dae4cd0b18a7870a9d9de915fa01dc`. Pi dependencies remain exactly `0.84.3`; no Pi source was modified. It replaces only V2.3's OAuth-blind completion dispatch. It does not change the selector prompt or version `v2.3.0`, provider/model, retrieval, corpus, benchmark, gold labels, Gate, or `SupportAgentRuntime`.

The immutable FIRST report remains `evals/selection/semantic/reports/first-real-run.json` with SHA-256 `F487652C1EBB50EAC55A77B69660D2B2A85F3B5EFDFBF892C05F45D1F25D6EC3`. Earlier reports are unchanged.

## Official Pi path

The previous V2.3 adapter used `@earendil-works/pi-ai/compat` `getModel()` and `completeSimple()`. That compatibility path does not resolve Coding Agent stored OAuth credentials for `openai-codex`; it can only use explicit or environment API-key configuration. This was the cause of the previous immediate error envelope.

The corrected path uses the public `ModelRuntime` SDK exported by `@earendil-works/pi-coding-agent`:

1. `ModelRuntime.create({ refreshOnCreate: false })`
2. `modelRuntime.checkAuth("openai-codex")`
3. `modelRuntime.getModel("openai-codex", "gpt-5.6-sol")`
4. `modelRuntime.completeSimple(model, context, options)`

Pi's public `ModelRuntime` owns AuthStorage and request preparation. This repository does not read `auth.json`, extract or inject tokens, serialize credentials, expose account identifiers, or implement another OAuth manager. The generic `OneShotSemanticEvidenceSelector` still receives only final text or a typed failure; the Pi-specific factory receives an injected completion runtime.

## One real control call

Real provider call count: `1`. The non-benchmark control was `Return exactly OK`, using `openai-codex/gpt-5.6-sol`, normal `auto` transport, and a bounded `15000` ms diagnostic timeout. Its sanitized immutable checkpoint record is [oauth-aware-completion-control.json](../../evals/selection/semantic/reports/oauth-aware-completion-control.json).

| Field | Result |
| --- | --- |
| authConfigured | `true` |
| elapsedMs | `2962` |
| timeoutMs | `15000` |
| outcome | `assistant_message` |
| stopReason / rawStopReason | `stop` / `completed` |
| content block types / count | `text` / 1 |
| text block count / total length | 1 / 2 |
| thinking block count / total length | 0 / 0 |
| usage input / output / reasoning / total | 16 / 5 / 0 / 21 |
| responseIdPresent | `true` |
| errorMessagePresent | `false` |
| safeErrorCategory | not applicable |

The control report was created before its diagnostic schema contained `textMatchesExpectedControl`; that value was not recorded. The schema is now covered by deterministic tests and will persist only a boolean for future controls, never raw control text. No additional request is permitted to fill this historical field, and no conclusion is inferred from text length alone.

## Decision

**OAUTH-AWARE PI COMPLETION PATH VALIDATED** for stored-auth resolution and successful text-envelope delivery. The prior 11 ms no-content failure was caused by the OAuth-blind compat completion path, not demonstrated semantic-selector quality failure.

**SEMANTIC CAPABILITY NOT YET VALIDLY EVALUATED.** The exact-control text-match datum was not captured, and the 44-call semantic benchmark has not been rerun. Runtime integration and a V2.3 release tag remain prohibited pending independent review.
