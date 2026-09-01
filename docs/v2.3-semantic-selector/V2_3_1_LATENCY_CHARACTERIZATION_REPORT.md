# V2.3.1 Latency and Runtime-Budget Characterization

## Scope and decision boundary

This is a latency characterization only. It is not a semantic-quality Gate,
does not amend the frozen final unseen Gate, and does not authorize Runtime
Integration, merge, release, a tag, or a change to the production selector
default timeout.

The exact V2.3.1 final true unseen Gate remains **INFRASTRUCTURE BLOCKED**.
Semantic capability remains not validly established.

## Frozen execution identity

| Field | Value |
| --- | --- |
| Evaluation source commit | `aed4b29179deeb439d28d767bc00ceb3e367274b` |
| Provider/model | `openai-codex` / `gpt-5.6-sol` |
| Prompt version/SHA-256 | `v2.3.1` / `fabf617ce6ecd9cc4f91cd68e42c789f1c0be629297e046a3c782fe6bfe29869` |
| Latency population SHA-256 | `12ecb05c89d7a75a078ae16047e5fbca07635a8720f31705681eb85ee01362c4` |
| Observation timeout | `30000ms` (evaluation only) |
| Scheduled / actual calls | `30` / `30` |
| Schedule | ten fixed, already-exposed inputs; rounds `1`, `2`, then `3`; sequential only |

The production selector default remains `2000ms`. This measurement used an
explicit `30000ms` observation timeout only in the evaluation runner.

## Population and durable evidence

The fixed population is [inputs.json](../../evals/selection/semantic/latency-v2.3.1/inputs.json).
It contains ten inputs already exposed by Recovery-2 or the V2.2 boundary
attempt, with two and three candidate records represented. It introduces no
new holdout query, corpus material, or prompt content.

The durable, write-once evidence is:

- [attempt manifest](../../evals/selection/semantic/reports/latency-v2-3-1-attempt-manifest.json)
- [fsync-backed JSONL journal](../../evals/selection/semantic/reports/latency-v2-3-1-traces.jsonl)
- [journal-derived machine report](../../evals/selection/semantic/reports/latency-v2-3-1-report.json)

The journal has 30 valid, unique records with contiguous sequence `1..30`; its
final report has the same count. No invocation was retried or run in parallel.
The trace records only sanitized output observations and timing metadata; it
does not contain credentials or hidden reasoning.

## Measured observations

| Observation | Value |
| --- | ---: |
| Successful final responses | 29 |
| Provider errors | 1 (3.33%) |
| Timeouts at 30000ms | 0 |
| Invalid outputs | 0 |
| Non-timeout latency sample count | 30 |
| Min / mean / P50 | 2833 / 8436 / 7354 ms |
| P75 / P90 / P95 | 8566 / 11471 / 16665 ms |
| Max | 27779 ms |

The one provider error is `latency-v2.3.1-05`, round 2, at `3341ms`. It is
preserved as an infrastructure observation, not converted into a semantic
claim. The runner completed the bounded population without retrying it.

### Sequential round behavior

| Round | Calls | P50 | Max |
| --- | ---: | ---: | ---: |
| 1 | 10 | 7354 ms | 16665 ms |
| 2 | 10 | 7287 ms | 9893 ms |
| 3 | 10 | 7196 ms | 27779 ms |

### Counterfactual observation budgets

These counts are derived only from the durable journal. A self-timeout at the
30000ms observation boundary would count as exceeding every lower budget, but
not as exceeding `30000ms` itself; this run had no such timeout.

| Budget | Exceeded calls | Rate |
| --- | ---: | ---: |
| 2000 ms | 30 | 100.00% |
| 3000 ms | 29 | 96.67% |
| 4000 ms | 28 | 93.33% |
| 5000 ms | 28 | 93.33% |
| 6000 ms | 25 | 83.33% |
| 8000 ms | 11 | 36.67% |
| 10000 ms | 5 | 16.67% |
| 15000 ms | 2 | 6.67% |
| 20000 ms | 1 | 3.33% |
| 30000 ms | 0 | 0.00% |

## Historical reference, not a pooled statistic

The immutable final true unseen attempt is reported separately and is not
pooled with this characterization: 20 calls, 19 successful responses, one
`15000ms` timeout, min `2420ms`, P50 `3339ms`, P95 `5035ms`, max `15000ms`.
See [FINAL_TRUE_UNSEEN_GATE_REPORT.md](FINAL_TRUE_UNSEEN_GATE_REPORT.md).

## Implications and explicit non-decisions

The observed OAuth-aware selector path is **not empirically compatible with a
2000ms budget** for this fixed historical population: all 30 observed calls
exceeded it. This is a measurement result, not an instruction to change the
production timeout or enable the selector in `SupportAgentRuntime`.

No default timeout, selector semantics, prompt, provider/model, corpus,
retrieval, benchmark, gold, runtime, or historical Gate evidence was changed.
No semantic capability PASS or FAIL is inferred from selection outcomes in this
latency run.

CUSTOMER SUPPORT AGENT V2.3.1

LATENCY CHARACTERIZATION COMPLETE

FINAL TRUE UNSEEN GATE REMAINS INFRASTRUCTURE BLOCKED

RUNTIME INTEGRATION NOT AUTHORIZED

RELEASE NOT AUTHORIZED
