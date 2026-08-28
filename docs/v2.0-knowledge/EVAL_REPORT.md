# V2.0 Governed Knowledge Evaluation Report

Command: `npm run eval:knowledge`

Result: **PASS** on 40/40 controlled runtime cases.

| Metric | Result |
| --- | --- |
| Pass rate | 100% |
| Approved/test-admitted evidence usage | 100% |
| Unapproved evidence acceptance | 0% |
| Synthetic evidence accepted in production mode | 0% |
| Retired evidence acceptance | 0% |
| Cross-tenant leakage | 0% |
| Cross-store leakage | 0% |
| Unsupported business-fact rate | 0% |
| Evidence trace accuracy | 100% |
| Evidence-version trace accuracy | 100% |
| No-evidence fail-closed rate | 100% |

The machine-readable output is [latest.json](../../evals/knowledge/reports/latest.json). It records actual tool events, evidence records, persisted audit records, final output, and handoff state per case.
