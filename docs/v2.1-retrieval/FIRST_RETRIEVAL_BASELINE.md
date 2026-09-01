# V2.1 FIRST Retrieval Baseline

The first V2.1 public-benchmark result is preserved at [`evals/retrieval/reports/first-run.json`](../../evals/retrieval/reports/first-run.json). It runs the frozen literal-matching baseline before the bounded, deterministic lexical normalization/ranking used for the final benchmark. The runner writes this file only when it does not already exist, so later final runs cannot overwrite the recorded first result.

| Metric | FIRST baseline |
| --- | ---: |
| Retrieval queries | 62 |
| Top-1 Hit Rate | 0% |
| Recall@3 | 0% |
| No-Answer Correct Rejection Rate | 100% |
| Wrong Evidence Rate | 0% |
| Cross-tenant leakage | 0% |
| Cross-store leakage | 0% |
| Unauthorized knowledge exposure | 0% |

The zero answerable-query retrieval scores are an observed baseline limitation, not a production-policy statement. Source material is limited to the V2.1 public benchmark: official public pages are factual authority; real-case wording is scenario-only; and synthetic wording is augmentation-only.
