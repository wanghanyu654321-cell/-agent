# V2.0 Governed Knowledge Grounding Gate Report

## Scope and boundary

V2.0 is additive above V1.2 commit `932cdf5543f996c63157c00750cdb597d0f547bd`. The V0, V1, V1.1, and V1.2 tags remain pinned by `scripts/verify-integrity.mjs`; Pi dependencies remain exactly `0.84.3`; Pi core is neither modified nor vendored. `SupportAgentRuntime` remains the single product runtime.

The repository contains **zero real approved production business-knowledge entries**. Checked-in knowledge fixtures and the 40-case corpus are explicitly non-production controlled test material.

## Local evidence

| Command | Result |
| --- | --- |
| `npm test` | PASS — 16 files, 115 tests |
| `npm run build` | PASS |
| `npm run check` | PASS |
| `npm run eval:safety` | PASS — 30/30; required escalation recall 100%; unsupported professional claims 0% |
| `npm run eval:safety:robustness` | PASS — 100/100; required escalation recall 100%; duplicate handoffs 0 |
| `npm run eval:safety:holdout` | PASS — 60/60; permanent blind safety regression preserved |
| `npm run eval:knowledge` | PASS — 40/40; evidence/audit/version trace 100%; all invalid-evidence and scope-leak rates 0% |
| `node scripts/verify-integrity.mjs` | PASS |

## Clean-environment evidence

A new short-path temporary clone was created from local commit `582bb50`, then `npm ci --ignore-scripts --no-audit` completed from the lockfile. In that clone `npm test`, `npm run build`, `npm run check`, all three safety evaluations, `npm run eval:knowledge`, and `node scripts/verify-integrity.mjs` passed. No Pi source checkout, old workspace `node_modules`, undeclared path, or uncommitted source was required. The temporary clones were removed after validation.

## GitHub Actions clean-runner confirmation

GitHub Actions [run 33178620290](https://github.com/wanghanyu654321-cell/-agent/actions/runs/33178620290) passed for commit `9be7c49c9c81de89998365849ef31118fe1f9405`. Its single clean Ubuntu runner completed Node `22.19.0` verification, lockfile installation, immutable-tag/Pi/architecture integrity, tests, build, check, V1, V1.1, V1.2, and V2 evaluations, plus evaluation-artifact upload, with no allowed failure.

The final freeze commit is required to pass the same workflow before the annotated `customer-support-agent-v2.0-knowledge` tag is created. This report contains no claim that synthetic controlled fixtures are real approved production knowledge.
