# V2.1 Final Retrieval Report

## Scope

This is a bounded public local-services retrieval benchmark, not a beauty-store policy corpus or a production approval of store facts. It evaluates 13 atomic records: 11 factual records from `PUBLIC_OFFICIAL_AUTHORITY` sources plus two source-backed scope probes. It uses 62 queries: 50 answerable, 10 no-answer, and two cross-scope probes.

Query provenance is deliberately separate from factual authority:

| Provenance | Count | Allowed role |
| --- | ---: | --- |
| `PUBLIC_REAL_CASE` | 12 | De-identified query/scenario wording only; never a factual source. |
| `HUMAN_AUTHORED` | 35 | Benchmark query coverage only. |
| `SYNTHETIC_QUERY` | 15 | Test augmentation only; never a factual source. |

## FINAL baseline

The final run is preserved at [`evals/retrieval/reports/public-real-world-final.json`](../../evals/retrieval/reports/public-real-world-final.json).

| Metric | FINAL result |
| --- | ---: |
| Top-1 Hit Rate | 96% |
| Recall@3 | 100% |
| No-Answer Correct Rejection Rate | 100% |
| Wrong Evidence Rate | 0% |
| Cross-tenant leakage | 0% |
| Cross-store leakage | 0% |
| Unauthorized knowledge exposure | 0% |
| Runtime unsupported business-fact rate | 0% |
| Runtime evidence trace accuracy | 100% |
| Runtime evidence-version trace accuracy | 100% |
| Runtime no-evidence fail-closed rate | 100% |

The runtime evaluation executes every case through the product `SupportAgentRuntime`, real Pi Agent tool events, and persisted `support-agent.audit`; it is not a helper-only retrieval test. Used evidence IDs, versions, and source references are asserted against both `SupportResult` and the audit record.
