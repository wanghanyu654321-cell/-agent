# V2.3 Semantic Gate Evidence Durability

## Scope and result

This checkpoint starts at `07ec0ecfc94975e5f2b3b8ce7b32341a7790772a`. It changes only the offline V2.3 evaluation evidence lifecycle, deterministic tests, and documentation. It makes **zero real-model calls**. It does not change the selector prompt or version, provider/model, retrieval, corpus, benchmark, gold labels, ranking, Gate thresholds, timeouts, or runtime integration.

The previous OAuth-aware runner accumulated its 44 invocation traces in process memory and used a direct `writeFileSync` only after the complete evaluation returned. It was not an atomic report-write implementation and it did not durably persist records per invocation. The process ended before that final write, so no completed-call count, trace, metric, latency, or result can be honestly reconstructed. Historical reports remain unchanged, including `first-real-run.json`, `io-contract-run.json`, the envelope and control reports, and `oauth-aware-semantic-gate-infrastructure-blocked.json`.

## Future recovery attempt lifecycle

The recovery-2 OAuth-aware runner uses this distinct, write-once identity:

| Artifact | Path | Rule |
| --- | --- | --- |
| Manifest | `evals/selection/semantic/reports/oauth-aware-semantic-gate-recovery-2-attempt-manifest.json` | Created and fsynced before call #1; captures only safe frozen configuration and an attempt identity. |
| Trace journal | `evals/selection/semantic/reports/oauth-aware-semantic-gate-recovery-2-traces.jsonl` | A single sanitized record is appended and fsynced immediately after each completed semantic invocation. |
| Final report | `evals/selection/semantic/reports/oauth-aware-semantic-gate-recovery-2-run.json` | Write-once; produced only after complete journal reconstruction. |

The evaluator remains filesystem-independent. Its optional `onInvocationComplete(trace)` observer is awaited after every completed primary or reversed invocation. Consequently the order is: primary completion → observer/journal fsync succeeds → reversed invocation; reversed completion → observer/journal fsync succeeds → next case. The observer throwing stops evaluation before the next model call. The 28 one-candidate cases are direct selections and do not consume semantic calls. The 22 multi-candidate cases produce exactly 44 sequential calls; no concurrent requests are started.

Each journal record includes sequence, case ID, order, candidate count, label-to-evidence-ID mapping, expected evidence ID, outcome, selected label and mapped evidence ID when present, classification, sanitized raw-output shape/SHA-256/length when present, and elapsed milliseconds. It excludes raw model text, thinking content, usage/tokens, credentials, account IDs, headers, and raw provider errors.

## Recovery rules

Only newline-terminated, valid JSONL records are accepted. A partial final line is ignored and explicitly reported. A malformed completed line, duplicate sequence, or duplicate `caseId + order` fails closed. Existing manifest, journal, or final-report paths prevent a new execution: an authorized retry must use a new identity and must never append to an older attempt.

`reconstructSemanticSelectionEvaluation()` rebuilds metrics from the frozen cases and persisted evidence only. It publishes official metrics and a PASS/FAIL decision only when all expected trace pairs are valid, unique, and present (44 for the frozen population), and their sorted sequences are exactly contiguous `1..44`. Any partial, malformed, duplicate, sequence-gapped, or mismatched trace set returns `infrastructure_blocked` with no metrics and no inferred Gate result.

## Final report publication

The journal remains the authoritative recoverable evidence; the final report is derived only from a complete deterministic reconstruction. Publication is write-once and uses this same-directory sequence:

```text
complete journal
→ deterministic reconstruction
→ exclusively create final-path.tmp-<pid>-<nonce> in the final report directory
→ write complete JSON and fsync the temporary file
→ close the temporary file
→ atomically create the final path as a same-filesystem hard link
→ remove the temporary path
```

The hard-link publication step is deliberately used instead of Node's overwrite-capable `rename` behavior: it atomically creates the final directory entry and fails if an existing final report wins the race. The code never deletes or replaces an existing final report. If writing, fsync, close, or publication fails, it closes descriptors, removes only the temporary file, and propagates the failure. If temporary cleanup also fails, the original failure remains included rather than being hidden.

The implementation does not claim a directory-metadata fsync guarantee on Windows. Its mandatory guarantee is a complete fsynced same-directory temporary file followed by no-overwrite atomic final-path creation. A failed or incomplete final publication does not invalidate the already durable journal.

## Deterministic evidence

The added deterministic tests prove that persistence completes before reversed invocation, observer failure stops before the next invocation, valid JSONL records survive a partial trailing write, duplicate invocation identities fail closed, existing attempts cannot be appended, and final reports refuse overwrite. They also prove complete temporary report content exists before final publication, existing final content is preserved, pre-publication fsync failure cleans the temporary file, and sequence gaps or non-one starts fail closed. A complete contiguous persisted trace set reconstructs the same Gate metrics; an incomplete set cannot publish them.

## Authorized recovery execution record

The one subsequently authorized Recovery Gate process was started at source HEAD `df9cefdd1d10bb8764658798bbdbec766176e5ce` with the frozen `openai-codex/gpt-5.6-sol` environment. It terminated before manifest creation, journal creation, final-report publication, or any semantic model completion: the runner's local `git rev-parse HEAD` provenance command was rejected by Git's worktree ownership protection. The runner reaches that command before `createDurableSemanticGateAttempt()`, so the resulting manifest, JSONL journal, and final report are all absent and the exact real semantic call count is `0`.

This is **SEMANTIC GATE INFRASTRUCTURE BLOCKED**, not a semantic PASS or semantic failure. The process is not retried under this authorization. `SupportAgentRuntime` integration and a V2.3 release tag remain prohibited pending independent review and a separately authorized recovery execution.

## Recovery-2 execution record

The separately authorized recovery-2 execution ran from committed source `edb70e6c9d7e5b48defd5e42708e591d337bae4d` after its repository-scoped Git provenance resolution succeeded. Its manifest records the frozen `openai-codex/gpt-5.6-sol`, prompt `v2.3.0`, frozen hashes, and `15000` ms evaluation timeout before call #1. The durable journal contains 44 unique, newline-terminated records with contiguous sequences `1..44`; the derived final report was published once.

The complete evidence has no provider errors, timeouts, invalid outputs, wrong selections, or order-induced wrong selections. It nevertheless fails the frozen offline Gate: `correctSelectionRate = 0.96` is below the required `0.98`, with three non-selections (`public-04/primary`, `public-04/reversed`, and `public-28/primary`). This is **SEMANTIC SELECTOR OFFLINE GATE FAILED**. The result is final for this authorization: no selector tuning, rerun, runtime integration, or V2.3 release tag is authorized.
