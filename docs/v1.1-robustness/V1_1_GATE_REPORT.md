# V1.1 Safety Robustness Hardening Gate Report

## Scope and preservation

- Working branch: `feat/v1.1-safety-robustness`.
- V0 annotated tag peel: `customer-support-agent-runtime-v0^{}` = `72eadc11a47e4176887607a310e74c242d4a261a`.
- V1 annotated tag peel: `customer-support-agent-v1-safety^{}` = `9c60fe9a0764bd22a595d13a463b5665899d7c35`.
- The read-only Pi source commit `6026a439cc345969f708a820990dd3fe8d88f0b7` remains available and its working tree was clean during this review.
- Pi packages remain pinned to `0.84.3`; no `workspace:*` dependency, relative import into a Pi workspace, or vendored Pi Agent/SessionManager/model/tool-registry source was found.

## Commands and results

| Command | Result |
| --- | --- |
| `npm.cmd test` | PASS — 8 files, 72 tests |
| `npm.cmd run build` | PASS |
| `npm.cmd run check` | PASS — Biome plus `tsgo --noEmit` |
| `npm.cmd run eval:safety` | PASS — preserved V1 controlled evaluation |
| `npm.cmd run eval:safety:robustness` | PASS — 100/100 runtime-derived cases |
| Fresh copy: `npm.cmd ci --ignore-scripts` | PASS — 278 declared packages installed; 0 vulnerabilities reported by npm audit |
| Fresh copy: `npm.cmd test` | PASS — 72/72 |
| Fresh copy: `npm.cmd run build` | PASS |
| Fresh copy: `npm.cmd run check` | PASS |
| Fresh copy: both safety eval commands | PASS |

The fresh-copy verification excluded `.git`, `node_modules`, and `dist` from the source copy and ran from a newly generated temporary directory. It therefore did not resolve modules through the existing product checkout or the sibling Pi source checkout.

## Safety robustness results

| Gate | Result |
| --- | ---: |
| Meaningful unique cases | 100 |
| Safety Detection Recall | 100% |
| Safety Detection Precision | 100% |
| Hard Negative Accuracy | 100% |
| Required Escalation Recall | 100% |
| Escalation Precision | 100% |
| Supported Answer Grounding Rate | 100% |
| Unsupported Professional Claim Rate | 0% |
| Runtime Tool Trace Accuracy | 100% |
| Handoff Success Rate | 100% |
| Duplicate Handoff Count | 0 |
| Synthetic Production Evidence Acceptance | 0 |
| Unapproved Evidence Acceptance | 0 |

`evals/safety/robustness/runner.ts` obtains all traces from actual runtime output, Pi Agent tool events, persisted `support-agent.audit`, and the handoff store. The negative-control inspector test proves a deliberately unsafe final continuation instruction is counted as a failure. A second regression proves that appended professional text is rejected even when it follows an otherwise approved supported response.

## Gate decision

**PASS.** The V1.1 robustness changes preserve the single SupportAgentRuntime, existing handoff idempotency boundary, existing RetrievalService boundary, and V0/V1 behavior. They add only deterministic normalized lexical detection, an inspectable output rule, a runtime-derived controlled evaluation harness, tests, generated reports, and documentation.

Known limitation: the controlled fixtures are non-production and do not establish professional treatment correctness. Until a separately governed approved professional corpus is supplied, missing or inadequate evidence continues to pause and escalate.
