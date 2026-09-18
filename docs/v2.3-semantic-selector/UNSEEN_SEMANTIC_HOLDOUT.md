# Unseen Semantic Holdout V1

## Status

**REAL-MODEL HOLDOUT GATE NOT YET EXECUTED.** This freeze creates no provider call, makes no semantic capability claim, and does not authorize runtime integration or a release tag.

The repeatedly reviewed public benchmark is no longer the final semantic-capability Gate. Benchmark Contract Audit V3 is the final interpretation of that historical population: 39 `SUPPORTED`, 11 `PARTIAL`, and 0 `UNSUPPORTED`. The public benchmark is therefore **PARTIALLY VALID**. Its immutable Recovery-2 result remains **FAILED**.

## Frozen population

`evals/selection/semantic/holdout-v1/cases.json` has 30 primary cases:

- 24 direct-and-sufficient positive selections;
- 6 hard `ABSTAIN` cases, where the candidates are related but insufficient for the requested answer;
- 30 unique queries, none identical to a legacy public-benchmark query;
- 2–3 approved-corpus candidate evidence IDs per case.

Each primary case has one deterministic reversal: `[A, B]` becomes `[B, A]`; `[A, B, C]` becomes `[C, B, A]`. The query, candidate identity set, and expected evidence identity are unchanged. The future run is therefore 30 primary calls plus 30 reversed calls, or 60 calls in total.

## What the future Gate tests

1. When evidence is directly sufficient, the selector chooses the exact approved evidence.
2. When evidence is only related but insufficient, the selector returns `ABSTAIN` rather than selecting unsupported evidence.
3. Changing candidate order does not change the correct outcome.

The freeze manifest pins the raw cases SHA-256, the approved corpus hash, the `v2.3.0` prompt hash, and integer-only pass requirements. It deliberately records the future Gate only; it must not be treated as a result until separately authorized and executed.
