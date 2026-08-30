# V2.3 Provider Error Classification

## Scope

This phase starts at `b1cd1dadd7a7ef5a19de64f8e2231cdd8704e744`. It corrects a confirmed adapter-classification defect only. It does not change the selector prompt or prompt version `v2.3.0`, provider/model choice, retrieval, corpus, benchmark, gold labels, Gate thresholds, or `SupportAgentRuntime`. Pi remains an unmodified dependency pinned to `0.84.3`.

Phase: `1` (provider error classification and adapter error semantics).

The immutable FIRST report remains `evals/selection/semantic/reports/first-real-run.json` with SHA-256 `F487652C1EBB50EAC55A77B69660D2B2A85F3B5EFDFBF892C05F45D1F25D6EC3`. Earlier envelope reports remain unchanged.

## Confirmed adapter defect and corrected semantics

Pi `completeSimple()` returns a complete `AssistantMessage`, including failed terminal envelopes. The previous Pi adapter joined only `content` blocks whose type was `text`. Therefore an envelope with `stopReason: "error"` and `content: []` became `""`, then the generic JSON parser labelled it `invalid`.

The corrected boundary is deliberately small and typed:

- Pi `stopReason: "error"` maps to `selection: "ABSTAIN"`, `outcome: "provider_error"` before any parsing.
- Pi `stopReason: "aborted"` maps to `selection: "ABSTAIN"`, `outcome: "timeout"` before any parsing.
- Pi `stopReason: "stop"` and `"length"` expose only final `text` blocks to the generic parser. `length` is not automatically an error.
- Empty successful text and thinking-only successful envelopes remain `invalid`; thinking is never treated as a selector answer.

The generic `OneShotSemanticEvidenceSelector` receives only final text or this typed failure result; it does not depend on Pi envelope structure. Deterministic regression tests cover error, aborted, empty successful stop, valid final text, `length`, and thinking-only behavior.

## Single control call and safe classification

Exactly one new real control call was made after the correction. It used `openai-codex` with `gpt-5.6-sol`, normal `auto` transport, `timeoutMs: 2000`, and the non-benchmark instruction `Return exactly OK`. The sanitized record is [provider-error-classification-control.json](../../evals/selection/semantic/reports/provider-error-classification-control.json).

| Field | Result |
| --- | --- |
| Elapsed | 11 ms |
| Outcome | `assistant_message` |
| stopReason | `error` |
| errorMessagePresent | `true` |
| Safe error category | `unknown` |
| Content block types / count | none / 0 |
| Text blocks / total text length | 0 / 0 |
| Thinking blocks / total thinking length | 0 / 0 |
| Usage input / output / reasoning / total | 0 / 0 / unavailable / 0 |
| Response ID present | `false` |
| Provider diagnostic types / codes | none / none |

The diagnostic classifier examines a raw provider error message only in memory and persists only one of: `timeout_or_abort`, `authentication`, `authorization_or_account`, `usage_or_quota`, `model_unavailable`, `transport_or_network`, `upstream_provider`, or `unknown`. It does not print or store the raw error message, thinking content, response ID, credentials, headers, or auth paths.

## Final diagnosis

**PROVIDER ERROR REMAINS UNRESOLVED.** The provider returned a fast, successful transport-level `AssistantMessage` error envelope but its safe category is `unknown`; no provider diagnostic code was supplied. The one-call budget is exhausted. This is not evidence of poor semantic selection quality.

**SEMANTIC CAPABILITY NOT YET VALIDLY EVALUATED.** No runtime integration, V2.3 release tag, provider/model change, prompt adjustment, or additional benchmark call is authorized by this checkpoint.
