# Sufficiency Boundary Holdout V2.2 Gate Report

## Verdict

**V2.3 SUFFICIENCY BOUNDARY GATE FAILED.** Runtime Integration is **NOT AUTHORIZED** and release remains **NOT AUTHORIZED**. This is a complete 24-call semantic result, not a provider or timeout block. No prompt, selector, provider/model, corpus, retrieval, benchmark, gold, threshold, or runtime code was changed after exposure.

## Immutable attempt

| Field | Value |
| --- | --- |
| Provider / model | `openai-codex` / `gpt-5.6-sol` |
| Prompt / hash | `v2.3.0` / `ac4831b003263bf8aea76dd13f535808f84a39306055402ac1f99725707acf4f` |
| Holdout frozen commit | `e34e82847bb1e2465924e34c043d5e492d4dde2f` |
| Evaluation source commit | `98ef61b9a0807234a93e9080ec43a0f08944a098` |
| Evidence / cases SHA-256 | `33cab975a04c66e3bfb357dbc92ff88e39ff131b57bac198983fc93c4c44eda5` / `0a65ee1111722e367c7ca5ab4105b89b0a1b0a2b20c0b4537db9ff357c5aa71a` |
| Per-invocation timeout | `15000ms` |
| Expected / actual calls | `24 / 24` |
| Journal | 24 unique valid records, contiguous `1..24`, no incomplete trailing line |

## Metrics derived from the journal

| Population | Correct | Wrong / unsafe selection | Positive ABSTAIN |
| --- | ---: | ---: | ---: |
| Group A primary: 4 answerable non-uniqueness cases | 4 | 0 | 0 |
| Group A reversed | 4 | 0 | 0 |
| Group B primary: 8 true-insufficiency cases | 6 ABSTAIN | 2 | n/a |
| Group B reversed | 3 ABSTAIN | 5 | n/a |

Global counts: wrong selections `7`, invalid outputs `0`, provider errors `0`, timeouts `0`, order-induced wrong selections `4`, and order-induced outcome disagreements `5`. Latency: min `2637ms`, P50 `4300ms`, P95 `5179ms`, max `5917ms`.

## Failed traces

All failures are `false SELECT on TRUE_INSUFFICIENCY`; there are no false ABSTAINs on Group A, no wrong Group-A candidate selections, and no infrastructure/output failures.

| Trace | Selected relevant-but-insufficient evidence | Boundary requested but absent |
| --- | --- | --- |
| `boundary-v2.2-06/reversed` | `H22-MT-DUPLICATE-STORE-SCORING` | exact master-store score threshold |
| `boundary-v2.2-07/primary` | `H22-MT-DELIVERY-INFO-ACCURACY` | exact correction deadline |
| `boundary-v2.2-08/reversed` | `H22-MT-DELIVERY-FOODSAFETY-IMMEDIATE` | exact complaint-handling hours |
| `boundary-v2.2-09/primary` | `H22-MT-DELIVERY-APPEAL-EVIDENCE` | minimum evidence count |
| `boundary-v2.2-09/reversed` | `H22-MT-DELIVERY-APPEAL-EVIDENCE` | minimum evidence count |
| `boundary-v2.2-10/reversed` | `H22-MT-DISPUTE-BEYOND-AUTHORITY` | exact explanation deadline |
| `boundary-v2.2-12/reversed` | `H22-MT-FOODSAFETY-COMPENSATION-RIGHT` | uniform compensation formula |

The frozen prompt consistently distinguished direct multi-option evidence in Group A, but it did not reliably abstain when a relevant qualitative rule omitted a requested number, deadline, count, or formula. Four cases become wrong only after candidate reversal; one case is wrong in both orders. This is evidence of the current frozen selector’s insufficiency-boundary limitation, not permission to alter the post-exposure contract.

## Evidence preservation

The write-once attempt manifest, fsync-backed JSONL journal, and derived run report under `evals/selection/semantic/reports/` are the authoritative record. No traces contain hidden reasoning, raw model response text, OAuth credentials, or other provider credential material.
