# V2.3 Provider Response Envelope Diagnostic

## Scope and preservation

This is a diagnostic-only checkpoint at V2.3 HEAD `158910d3fbcfc3e81f48e21f2058785c7014f415`. It does not change the selector prompt, prompt version `v2.3.0`, provider/model, retrieval, corpus, benchmark, gold labels, Gate, or `SupportAgentRuntime`. No V2.3 tag was created.

The immutable FIRST report remains `evals/selection/semantic/reports/first-real-run.json` with SHA-256 `F487652C1EBB50EAC55A77B69660D2B2A85F3B5EFDFBF892C05F45D1F25D6EC3`. The I/O-contract report remains unchanged at `evals/selection/semantic/reports/io-contract-run.json`.

## Static Pi 0.84.3 audit

Installed dependency evidence is exact: `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, and `@earendil-works/pi-coding-agent` resolve to `0.84.3`. No Pi file was modified.

| Pi 0.84.3 path | Observed behavior |
| --- | --- |
| `dist/compat.js` | `completeSimple(model, context, options)` calls `streamSimple(...).result()`; it returns the complete `AssistantMessage` envelope. |
| `dist/api/openai-codex-responses.js` | Codex `streamSimple` maps simple options to `stream`; default transport is `auto`, and explicit `sse` bypasses WebSocket selection. |
| `dist/types.d.ts` | `AssistantMessage.content` supports `text`, `thinking`, and `toolCall` blocks. It also carries `responseModel`, `responseId`, `diagnostics`, `usage`, `stopReason`, `rawStopReason`, and `endTurn`. |
| `dist/api/openai-responses-shared.js` | Responses processing creates a `thinking` block for `reasoning`, a `text` block for `message`, and a `toolCall` block for calls. Terminal events finalize usage/stop reason and may populate response ID. |

The current selector's extraction only joins `content` blocks whose type is `text`. That extraction remains unchanged. The diagnostic proves that there were no blocks to extract; it does not reinterpret `thinking` as a selector label.

## Sanitized real-call evidence

Exactly three real calls were used. No raw provider output, candidate payload, hidden reasoning, OAuth/API credential, header, or auth path is persisted. The reports retain only envelope metadata, block types/counts, text/thinking lengths, usage, and diagnostic types/codes.

| Call | Report | Transport | Request | stopReason | Blocks | Text / thinking | Usage output / reasoning |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `provider-envelope-auto.json` | auto | Existing selector request, `public-01`, 2 candidates | `error` | none | 0 / 0 | 0 / unavailable |
| 2 | `provider-envelope-sse.json` | sse | Identical selector request | `error` | none | 0 / 0 | 0 / unavailable |
| 3 | `provider-envelope-control.json` | auto | Non-benchmark control: `Return exactly OK` | `error` | none | 0 / 0 | 0 / unavailable |

All three envelopes have no response ID and no provider diagnostic type/code. The control envelope reports `errorMessagePresent: true`, but the message content is intentionally not persisted. The two selector reports were captured before this presence-only field was added; both otherwise show the same `error`, zero-block, zero-usage envelope.

## Diagnosis

**INFORMATION_INSUFFICIENT**

The evidence rules out a selector text-extraction bug: `completeSimple()` returned error envelopes with no `text`, `thinking`, or `toolCall` blocks, not successful messages whose text was discarded. The identical result for explicit SSE rules out an observed auto-versus-SSE success difference. The trivial control also fails before any output usage or content is produced, so the evidence rules out a selector-request-specific response behavior.

The sanitized reports do not preserve the provider error message or a provider diagnostic code, and the maximum three permitted calls has been reached. Therefore this checkpoint cannot distinguish a provider/model incompatibility from an authentication, account, or upstream provider failure without either exposing sensitive error detail or collecting additional evidence. No repair is attempted.
