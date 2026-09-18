# V2.0.1 FAQ Admission Hardening Gate Report

## Scope

V2.0.1 closes a V2.0 FAQ-admission ordering defect without changing the frozen V2.0 baseline. The implementation is limited to pre-model FAQ candidate admission, its regression tests, the governed-knowledge evaluation, immutable-baseline verification, the existing clean-runner workflow, and documentation.

The repository still contains no real production-approved business knowledge. All controlled knowledge fixtures are synthetic test material and remain production-rejected unless an explicitly test-configured runtime enables them.

## Local verification

The implementation checkpoint is `f2c02fbdf28c1b3ff49aa244afb26be3aa195ee1`.

| Command | Result |
| --- | --- |
| `npm test` | PASS — 17 files, 127 tests |
| `npm run build` | PASS |
| `npm run check` | PASS |
| `node scripts/verify-integrity.mjs` | PASS — V0, V1, V1.1, V1.2, and immutable V2.0 tag peels; Pi pins and boundary checks intact |
| `npm run eval:safety` | PASS — 30/30; required escalation recall 100%; unsupported professional-claim rate 0% |
| `npm run eval:safety:robustness` | PASS — 100/100; required escalation recall 100%; duplicate handoff count 0 |
| `npm run eval:safety:holdout` | PASS — 60/60; blind safety regression preserved |
| `npm run eval:knowledge` | PASS — 46/46; evidence/audit/version trace 100%; all invalid-evidence and scope-leak rates 0%; Unauthorized FAQ Model Exposure Rate 0% |

The six added FAQ-negative cases execute through `SupportAgentRuntime`, real Pi Agent tool events, persisted sessions, `support-agent.audit`, final results, and output handling. They cover unapproved, retired, synthetic-production, tenant mismatch, store mismatch, and unauthorized-first/authorized-second candidate selection.

## Clean-environment verification

A new short-path clone of `f2c02fbdf28c1b3ff49aa244afb26be3aa195ee1` was made outside the product worktree. From that clone, `npm ci --ignore-scripts --no-audit` installed 278 lockfile-declared packages. The clone then passed `npm test` (17 files, 127 tests), `npm run build`, `npm run check`, `node scripts/verify-integrity.mjs`, and all V1, V1.1, V1.2, and V2.0.1 evaluation commands. No Pi source checkout, old worktree dependency directory, undeclared path, or uncommitted product file was used.

## Final clean-runner requirement

The existing GitHub Actions workflow is extended to trigger on `fix/v2.0.1-faq-admission` and runs the same lockfile installation, integrity, tests, build, check, V1, V1.1, V1.2, and V2.0.1 evaluation commands on a clean Ubuntu runner. The final gate requires:

- immutable V0 through V2.0 tag peels, including V2.0 at `98cca9b92c13c2639beb958177923b3c09b42ed9`;
- full unit/runtime regression, build, check, and integrity verification;
- V1, V1.1, V1.2, and expanded V2.0.1 evaluations;
- a clean installation with no Pi workspace or pre-existing dependencies;
- a passing GitHub Actions run on the exact final commit;
- `Unauthorized FAQ Model Exposure Rate = 0%` from persisted Pi-session evidence.

The annotated `customer-support-agent-v2.0.1-faq-admission` tag may be created only after that exact remote run passes.

## GitHub Actions confirmation

GitHub Actions [run 33182531546](https://github.com/wanghanyu654321-cell/-agent/actions/runs/33182531546) passed on `bce59d240178e893b1b4378309c307ed93f174ec`. Its clean Ubuntu runner completed lockfile installation, immutable-tag/Pi/architecture integrity, all 127 tests, build, check, V1 30-case evaluation, V1.1 100-case evaluation, V1.2 60-case holdout, V2.0.1 46-case knowledge evaluation, and evaluation-artifact upload with no allowed failure.

The final documentation checkpoint is required to pass this same workflow before the V2.0.1 annotated tag is created.
