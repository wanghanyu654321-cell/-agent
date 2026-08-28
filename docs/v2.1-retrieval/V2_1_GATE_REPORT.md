# V2.1 Real Knowledge & Retrieval Quality Gate Report

## Status

**GATE NOT PASSED — REAL_SOURCE_INPUT_REQUIRED**.

V2.1 code-side preparation is complete enough to preserve the boundary: private corpus/evaluation paths are Git-ignored, the private loader requires an explicit path, public synthetic regression is explicitly non-real, V2.0.1 tags are immutable under the integrity script, and no business fact was added.

## Code-side verification

| Command | Result |
| --- | --- |
| `npm test` | PASS — 20 files, 132 tests |
| `npm run build` | PASS |
| `npm run check` | PASS |
| `node scripts/verify-integrity.mjs` | PASS — V0 through V2.0.1 peeled tags, exact Pi pins, one runtime, and no unsafe/vendored boundary violation |
| `npm run eval:safety` | PASS — 30/30 |
| `npm run eval:safety:robustness` | PASS — 100/100 |
| `npm run eval:safety:holdout` | PASS — 60/60 |
| `npm run eval:knowledge` | PASS — 46/46; Unauthorized FAQ Model Exposure Rate 0% |
| `npm run eval:retrieval:public` | PASS — 4 controlled synthetic cases; explicitly excluded from real-corpus metrics |

## Public clean-clone verification

A fresh short-path clone of `5c344b22c6abc7d58d30612e02839f14727e340e` completed `npm ci --ignore-scripts --no-audit` from the lockfile (278 packages). It then passed all 132 tests, build, check, integrity verification, V1/V1.1/V1.2 safety regressions, V2.0.1 knowledge regression, and the public sanitized retrieval regression without a Pi checkout, old `node_modules`, or any private corpus mount.

## Public GitHub Actions verification

GitHub Actions [run 33185909597](https://github.com/wanghanyu654321-cell/-agent/actions/runs/33185909597) passed on `48bcf66dc8ec651ade1af2045593e9f9949dfcbd`. Its clean Ubuntu runner completed lockfile installation, integrity verification, all unit/runtime tests, build, check, V1/V1.1/V1.2/V2 regressions, and the V2.1 public sanitized retrieval regression. This run validates public code only; it neither loads nor claims a private real corpus.

The Real Source, Retrieval, Runtime, private-corpus clean-clone, and final GitHub release gates cannot run without an authoritative source and gold labels. No V2.1 release tag has been created.
