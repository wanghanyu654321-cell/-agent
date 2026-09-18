# True Unseen Semantic Holdout V2.1

## Status

**UNSEEN SEMANTIC HOLDOUT V2.1 GATE FAILED.** The one authorized first-exposure run completed all 48 calls with durable evidence. It made one unsafe selection in each order for hard-ABSTAIN case `holdout-v2.1-23`; runtime integration, a V2.3 release tag, and a selector change remain unauthorized. See [UNSEEN_HOLDOUT_V2_1_GATE_REPORT.md](UNSEEN_HOLDOUT_V2_1_GATE_REPORT.md).

V2.1 supersedes V2 only as the future unseen-capability evaluation population. V2 remains immutable historical pre-run evidence with zero model calls.

## Inputs and boundary

- 14 first-party Meituan Rules Center evidence records, all evaluation-only.
- 24 primary cases: 18 direct+sufficient positive selections and 6 hard `ABSTAIN` cases.
- 24 deterministic reversed-order diagnostics: exactly 48 future semantic calls.
- Exact raw evidence and case bytes are pinned in `evals/selection/semantic/holdout-v2.1/holdout-freeze-manifest.json`.
- Every raw case explicitly stores directness, sufficiency, and inference status; the validator verifies those fields and does not derive them from the expected output.

The new official propositions are service-before-completion premature voucher verification and undisclosed per-use voucher/group-buy limits. Neither is admitted to runtime knowledge.

## Frozen future Gate

The first authorized execution requires `openai-codex/gpt-5.6-sol`, prompt `v2.3.0`, prompt hash `ac4831b003263bf8aea76dd13f535808f84a39306055402ac1f99725707acf4f`, and evaluation timeout `15000ms`.

Pass requires exactly: 18/18 positive correct and 6/6 ABSTAIN on both primary and reversed orders, with zero wrong selections, unsupported selections, positive abstentions, invalid outputs, provider errors, timeouts, order-induced wrong selections, and order-induced outcome disagreements.

The Gate is a first-exposure property: V2 was pre-run material and made no model calls. The novelty audit explicitly distinguishes carried-forward V2 material from public/V1 exposure; no V2.1 item has been shown to the semantic model.

## Durable execution boundary

The dedicated command is `npm run eval:selection:semantic:holdout-v2.1`. Before its first semantic completion it writes and fsyncs a write-once attempt manifest. Every completed invocation appends and fsyncs a sanitized JSONL record before the next invocation begins. The journal holds only identity mappings, output shape/hash/length, outcome, classification, and latency; it never stores model reasoning, raw response text, OAuth credentials, or provider payloads.

If a local process is interrupted without a persisted provider error, timeout, or invalid output, the same command can resume only the missing `caseId + order` identities from a valid, contiguous journal prefix. It cannot overwrite a final report or replay a completed identity. A persisted provider error, timeout, or invalid output blocks a clean retry and remains durable failure evidence.
