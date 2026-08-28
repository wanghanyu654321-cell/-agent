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

The Real Source, Retrieval, Runtime, private-corpus clean-clone, and final GitHub release gates cannot run without an authoritative source and gold labels. No V2.1 release tag has been created.
