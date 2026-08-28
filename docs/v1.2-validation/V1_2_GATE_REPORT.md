# V1.2 Blind Validation and Independent CI Gate Report

## Local validation evidence

- V0, V1, and V1.1 peeled commits match their immutable contract values.
- Pi packages are pinned exactly to `0.84.3`.
- The 100-case V1.1 robustness evaluator remains a separate development regression suite.
- The 60-case holdout evaluator uses the real `SupportAgentRuntime`, actual Pi Agent tool events, audit, output guard, and handoff state.
- The first blind result is permanently preserved; the final holdout result meets every local threshold.
- The evaluator's negative controls prove that unsafe final output, an incorrect trace, a wrong category, and a duplicate-handoff metric can make the evaluator fail.

## GitHub Actions evidence

- Workflow: `Customer Support Agent Gate`.
- Clean-runner workflow run: [33141444321](https://github.com/wanghanyu654321-cell/-agent/actions/runs/33141444321).
- Validated checkpoint: `825b56ba7c065fb1e68698346c5907b3c4025782`.
- Result: **PASS**. The single gate job `98752955349` completed checkout, Node `22.19.0` verification, clean `npm ci --ignore-scripts`, integrity verification, tests, build, check, V1 eval, V1.1 robustness eval, V1.2 holdout eval, and artifact upload without an allowed failure.
- GitHub displayed an advisory about the internal Node 20 runtime used by the third-party v4 action implementations. This does not change the product job runtime: the workflow explicitly selected and verified Node `22.19.0`, and all required gate commands passed.

The final documentation-only checkpoint also passed the same clean-runner gate at [run 33141608880](https://github.com/wanghanyu654321-cell/-agent/actions/runs/33141608880), validating commit `ac626eb51bd783cad53ef13abb0557854510fb4d`. The immutable V1.2 tag is created only after the final report checkpoint receives this result.

## Gate conclusion

**PASS.** The V1.2 holdout, immutable first-run evidence, architecture and dependency integrity checks, and independent clean-runner CI Gate satisfy the V1.2 validation contract.
