# V1.2 Blind Validation and Independent CI Gate Report

## Local validation evidence

- V0, V1, and V1.1 peeled commits match their immutable contract values.
- Pi packages are pinned exactly to `0.84.3`.
- The 100-case V1.1 robustness evaluator remains a separate development regression suite.
- The 60-case holdout evaluator uses the real `SupportAgentRuntime`, actual Pi Agent tool events, audit, output guard, and handoff state.
- The first blind result is permanently preserved; the final holdout result meets every local threshold.
- The evaluator's negative controls prove that unsafe final output, an incorrect trace, a wrong category, and a duplicate-handoff metric can make the evaluator fail.

## External gate status

**PENDING GITHUB ACTIONS.** This report is intentionally not marked PASS until the pushed V1.2 branch has a green `Customer Support Agent Gate` workflow on GitHub's clean runner. The final report will identify that workflow evidence, then the V1.2 annotated tag may be created.
