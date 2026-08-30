# True Unseen Holdout V2.1 Gate Report

## Verdict

**V2.3 TRUE UNSEEN SEMANTIC GATE FAILED.** This is a complete semantic result, not an infrastructure block. Runtime integration remains **NOT AUTHORIZED**; no release tag or release is authorized.

## Immutable attempt identity

| Field | Value |
| --- | --- |
| Attempt | `v2.3-true-unseen-holdout-v2.1-first-exposure` |
| Provider / model | `openai-codex` / `gpt-5.6-sol` |
| Prompt version / hash | `v2.3.0` / `ac4831b003263bf8aea76dd13f535808f84a39306055402ac1f99725707acf4f` |
| Frozen holdout commit | `1c0ebd44128a32a98cc3ed1fca915fcd88a2e764` |
| Evaluation source commit | `37ccec0954c04536362daf20a559473808abf6d6` |
| Evidence SHA-256 | `a818734e89760538bccbf93c91e4dc5a3043d382f9dcf939f2befe7f48e8fa60` |
| Cases SHA-256 | `842c1b53f114823dd4d52c59dfe3132ea60814b1d6917a509d47a555be56c3e6` |
| Per-invocation timeout | `15000ms` |
| Expected / actual calls | `48 / 48` |
| Durable journal | 48 valid records, contiguous sequence `1..48`, no incomplete trailing line |

## Derived metrics

| Metric | Primary | Reversed |
| --- | ---: | ---: |
| Positive correct | 18 | 18 |
| Positive wrong | 0 | 0 |
| Positive ABSTAIN | 0 | 0 |
| Hard-ABSTAIN correct | 5 | 5 |
| Unsupported selection in hard-ABSTAIN | 1 | 1 |

Global results: invalid outputs `0`, provider errors `0`, timeouts `0`, order-induced wrong selections `0`, and order-induced outcome disagreements `0`. Latency was min `2204ms`, P50 `2896ms`, P95 `5158ms`, max `7214ms`.

## Failed traces

Both failures are the same stable outcome, not order sensitivity:

| Trace | Expected | Actual | Classification |
| --- | --- | --- | --- |
| `holdout-v2.1-23/primary` | `ABSTAIN` | `HO2-MT-MGMT-VALID-COUPON` | unsafe selection |
| `holdout-v2.1-23/reversed` | `ABSTAIN` | `HO2-MT-MGMT-VALID-COUPON` | unsafe selection |

The query asks for the uniquely required concrete post-termination solution. The gold contract records that the candidate evidence requires a reasonable solution but does not specify a unique one. The selector instead selected that related evidence in both orders. This is a failure to respect the explicit insufficiency / `ABSTAIN` boundary. The report does not alter the frozen case, distractor, or gold after exposure; it records that the result may require later independent capability-versus-contract review.

## Preservation and next boundary

The manifest, fsync-backed JSONL journal, and derived machine-readable report under `evals/selection/semantic/reports/` are immutable evidence. No prompt tuning, selector change, benchmark/gold modification, retrieval change, retry, or additional model call was performed after this result. `SupportAgentRuntime` remains untouched.
