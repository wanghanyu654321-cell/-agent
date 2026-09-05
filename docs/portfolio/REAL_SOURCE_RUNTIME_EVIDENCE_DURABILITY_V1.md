# Real-Source Runtime Evidence Durability V1

`IMPLEMENTATION CANDIDATE / PENDING INDEPENDENT REVIEW`.
`REAL-SOURCE RUNTIME PROOF V1 = NOT APPROVED`.

Reviewer authorization `5549510437` starts from
`56f3ed62b67097cb1b05ae5a9c679aa52df4ed2a`. The preceding after-fix run has no
recoverable durable Case/summary evidence; its actual attempt count is unknown.
No model failure or success can be inferred, and no rerun is authorized here.

## Operator journal

The existing smoke entrypoint now requires `REAL_SOURCE_RUNTIME_PROOF_JOURNAL`,
an absolute file path supplied by the operator in an existing directory outside
the repository. Parent symlinks are resolved before checking that boundary.
The file is exclusively created (`wx`, owner-only creation mode on POSIX), never
scanned for, reopened, overwritten, resumed, or committed. An absent, in-repository,
already-existing, or unwritable path fails with bounded `JOURNAL_UNAVAILABLE`
before provider bootstrap. No stdout-only execution is permitted.

Each JSONL append uses a private file descriptor and synchronous write + `fsync`.
The descriptor closes on a normal/catchable exit. A failed write/sync disables
further appends and stops execution; no subsequent case or persistence retry is
attempted. The partial file is retained for review.

| Event | Safe contents | Ordering |
| --- | --- | --- |
| `run_started` | Source HEAD, provider, model, attempts=0, retries=0 | Synced before private composition/provider bootstrap |
| `case_attempt_started` | Case ID, category, ordinal 1/2/3 | Synced before entering `runtime.run()` |
| `case_completed` | Case ID/category, result type, tools, evidence IDs, elapsed time, computed pass | Synced before the next attempt |
| `run_blocked` | Bounded category, confirmed attempt count, retries=0 | On a caught failure if the journal remains writable |
| `run_completed` | Attempts, retries=0, computed all-three pass | After all cases and resource cleanup |

The harness constructs these projections explicitly. It never journals answer
text, raw events, upstream errors, payloads, credentials, reasoning, corpus facts,
or private paths. Case acceptance remains unchanged: required knowledge lookup,
exact evidence/result contracts, and no successful business side effect.

## Recovery interpretation

Review the supplied file only. Complete newline-terminated JSON objects are the
recoverable prefix; a partial trailing line or absent terminal event is incomplete
evidence, never PASS. The largest complete `case_attempt_started.attemptOrdinal`
reserves that many runtime attempts conservatively. It does not prove completion,
the exact number of underlying LLM calls, or even dispatch if the process died
between fsync and `runtime.run()`. Never replay an identity based on missing output.
`case_completed` establishes a captured outcome; a synced `run_completed` supplies
the aggregate computed by the existing harness. If disk writes/sync fail, a bounded
terminal record may itself be unavailable; retain the file and report uncertainty.
This provides process-interruption evidence, not storage-hardware/host disaster
recovery or an automatic resume system.

## Deterministic verification and boundaries

`tests/real-source-runtime-durability.test.ts` exercises actual temporary files,
observes real fsync before bootstrap/dispatch, injects filesystem and runtime
failures, inspects an in-flight snapshot before completion/cleanup, and checks
safe projections, missing configuration, write-once and symlink boundaries.
Existing smoke tests retain the A/B/C acceptance and authority-guarded probe rules.
CI also retains all Runtime, Safety, Knowledge, PostgreSQL and Docker regressions.

External-provider calls for this change: **0**. Product Runtime baseline remains
`openai-codex / gpt-5.6-sol`; GPT-6 is the engineering model only. No Runtime,
provider adapter, prompts, skills, retrieval, corpus, authority, timeout or product
behavior changes. No merge, tag, release, Ready, Shadow, Assisted, customer
deployment, autonomous-reply or resume-deployment claim is authorized.
