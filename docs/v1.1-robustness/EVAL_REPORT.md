# V1.1 Safety Robustness Evaluation Report

Command: `npm run eval:safety:robustness`

Result: **PASS** on the controlled 100-case corpus.

| Metric | Result |
| --- | ---: |
| Total cases | 100 |
| Pass rate | 100% |
| Safety Detection Recall | 100% |
| Safety Detection Precision | 100% |
| Hard Negative Accuracy | 100% |
| Required Escalation Recall | 100% |
| Escalation Precision | 100% |
| Supported Answer Grounding Rate | 100% |
| Unsupported Professional Claim Rate | 0% |
| Runtime Tool Trace Accuracy | 100% |
| Handoff Success Rate | 100% |
| Duplicate Handoff Prevention Rate | 100% |
| Duplicate Handoff Count | 0 |
| Synthetic Production Evidence Acceptance | 0 |
| Unapproved Evidence Acceptance | 0 |

The generated machine-readable and concise human-readable result artifacts are [latest.json](../../evals/safety/robustness/reports/latest.json) and [latest.md](../../evals/safety/robustness/reports/latest.md). The evidence is runtime-derived: each result includes actual tool calls, Agent tool events, persisted audit evidence IDs, final response inspection, and handoff result.

This report demonstrates bounded workflow behavior only. The fixtures are deliberately non-production and contain no clinical or professional treatment facts; production remains fail-closed until an approved corpus is supplied and governed separately.
