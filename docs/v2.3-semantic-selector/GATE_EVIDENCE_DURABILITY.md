# V2.3 Semantic Gate Evidence Durability

## Scope and result

This checkpoint starts at `07ec0ecfc94975e5f2b3b8ce7b32341a7790772a`. It changes only the offline V2.3 evaluation evidence lifecycle, deterministic tests, and documentation. It makes **zero real-model calls**. It does not change the selector prompt or version, provider/model, retrieval, corpus, benchmark, gold labels, ranking, Gate thresholds, timeouts, or runtime integration.

The previous OAuth-aware runner accumulated its 44 invocation traces in process memory and used a direct `writeFileSync` only after the complete evaluation returned. It was not an atomic report-write implementation and it did not durably persist records per invocation. The process ended before that final write, so no completed-call count, trace, metric, latency, or result can be honestly reconstructed. Historical reports remain unchanged, including `first-real-run.json`, `io-contract-run.json`, the envelope and control reports, and `oauth-aware-semantic-gate-infrastructure-blocked.json`.

## Future recovery attempt lifecycle

The future OAuth-aware runner uses this distinct, write-once identity:

| Artifact | Path | Rule |
| --- | --- | --- |
| Manifest | `evals/selection/semantic/reports/oauth-aware-semantic-gate-recovery-attempt-manifest.json` | Created and fsynced before call #1; captures only safe frozen configuration and an attempt identity. |
| Trace journal | `evals/selection/semantic/reports/oauth-aware-semantic-gate-recovery-traces.jsonl` | A single sanitized record is appended and fsynced immediately after each completed semantic invocation. |
| Final report | `evals/selection/semantic/reports/oauth-aware-semantic-gate-recovery-run.json` | Write-once; produced only after complete journal reconstruction. |

The evaluator remains filesystem-independent. Its optional `onInvocationComplete(trace)` observer is awaited after every completed primary or reversed invocation. Consequently the order is: primary completion → observer/journal fsync succeeds → reversed invocation; reversed completion → observer/journal fsync succeeds → next case. The observer throwing stops evaluation before the next model call. The 28 one-candidate cases are direct selections and do not consume semantic calls. The 22 multi-candidate cases produce exactly 44 sequential calls; no concurrent requests are started.

Each journal record includes sequence, case ID, order, candidate count, label-to-evidence-ID mapping, expected evidence ID, outcome, selected label and mapped evidence ID when present, classification, sanitized raw-output shape/SHA-256/length when present, and elapsed milliseconds. It excludes raw model text, thinking content, usage/tokens, credentials, account IDs, headers, and raw provider errors.

## Recovery rules

Only newline-terminated, valid JSONL records are accepted. A partial final line is ignored and explicitly reported. A malformed completed line, duplicate sequence, or duplicate `caseId + order` fails closed. Existing manifest, journal, or final-report paths prevent a new execution: an authorized retry must use a new identity and must never append to an older attempt.

`reconstructSemanticSelectionEvaluation()` rebuilds metrics from the frozen cases and persisted evidence only. It publishes official metrics and a PASS/FAIL decision only when all expected trace pairs are valid, unique, and present (44 for the frozen population). Any partial, malformed, duplicate, or mismatched trace set returns `infrastructure_blocked` with no metrics and no inferred Gate result.

## Deterministic evidence

The added deterministic tests prove that persistence completes before reversed invocation, observer failure stops before the next invocation, valid JSONL records survive a partial trailing write, duplicate invocation identities fail closed, existing attempts cannot be appended, and final reports refuse overwrite. A complete persisted trace set reconstructs the same Gate metrics; an incomplete set cannot publish them.

No semantic Gate recovery run is authorized by this checkpoint. `SupportAgentRuntime` integration and a V2.3 release tag remain prohibited pending a separately authorized, fully durable real-model Gate execution.
