# Independent Gate Review

## Scope

This review verifies the extracted V0 product repository rather than relying on the Pi workspace. It uses published Pi `0.84.3` packages installed from the lockfile and does not alias or import the frozen source tree.

## Evidence

| Requirement | Code path | Test evidence |
| --- | --- | --- |
| Agent turns and tool budget | `SupportAgentRuntime.run`, Pi `shouldStopAfterTurn` and `beforeToolCall` | V0 turn and multi-tool budget cases |
| Timeout cancellation and late events | `createTools`, overall deadline race, event unsubscription | per-tool, uncooperative stream, and late-event cases |
| Session and audit persistence | `SessionManager` public export and support mapping | restore, fallback-resume, and audit cases |
| Strict business schemas | TypeBox schemas with `additionalProperties: false` | invalid/extra args for FAQ, knowledge, ticket, and handoff |
| Side-effect idempotency | ticket and handoff reservations | sequential and concurrent duplicate cases |
| Evidence and output guards | output checks in `run` | FAQ miss, no knowledge, empty provider, factual claim, escalation, and unsafe-promise cases |
| Read-only customer tools | `createTools` allowlist | exact four-tool Skills case |
| Monorepo independence | public Pi imports and self-contained configs | `extraction-independence.test.ts` and clean install |

## Result

PASS. The independent suite is 41/41, build passes, check passes, and a clean temporary installation repeats the same 41/41, build, and check results. No customer-facing path receives file, edit, shell, bash, or knowledge-write capability.
