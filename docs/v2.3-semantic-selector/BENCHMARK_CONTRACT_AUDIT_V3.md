# V2.3 Benchmark Contract Audit V3

Audit V3 is the final adjudication. It retains V2's explicit 50-case findings and changes only `public-38` and `public-39`: both are factual scenario statements, not remedy requests, and their reservation evidence directly classifies inability/refusal after reservation as non-reception. They are SUPPORTED, unlike `public-36`, `public-37`, and `public-40`, which explicitly ask `怎么办` and remain PARTIAL because the same gold supplies no remedy.

The final explicit totals are SUPPORTED `39`, PARTIAL `11`, UNSUPPORTED `0`. PARTIAL IDs: `public-04, public-23, public-26, public-28, public-29, public-36, public-37, public-40, public-41, public-42, public-44`.

The deterministic exact-caseId join against immutable Recovery-2 evidence is `44 = 38 SUPPORTED + 6 PARTIAL/UNSUPPORTED` traces. SUPPORTED: selected/correct `38`, abstain `0`, wrong `0`. PARTIAL/UNSUPPORTED: selected `3`, abstain `3`, wrong `0`. [Machine-readable V3 evidence](../../evals/selection/semantic/reports/benchmark-contract-audit-v3.json) contains all classifications and the derived join.

Only `public-04/primary` and `public-28/primary` reduce the 50-case primary correct-selection rate; `public-04/reversed` affects only multi-candidate/order diagnostics.

**BENCHMARK CONTRACT PARTIALLY VALID.** Frozen Recovery-2 remains **FAILED**. No model calls, rerun, selector/prompt/benchmark change, runtime integration, tag, or release is authorized.
