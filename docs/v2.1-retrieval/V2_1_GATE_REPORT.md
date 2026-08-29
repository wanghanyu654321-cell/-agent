# V2.1 Public Real-World Retrieval Benchmark Gate Report

## Gate scope

V2.1 is a bounded public local-services benchmark. `PUBLIC_OFFICIAL_AUTHORITY` is factual authority; `PUBLIC_REAL_CASE` is query/scenario wording only; and `SYNTHETIC_QUERY` is augmentation only. Neither public cases nor synthetic queries can admit a factual answer.

## Candidate verification

| Gate | Candidate result |
| --- | --- |
| Corpus | PASS — 11 official factual records, 2 source-backed scope probes; no private/store/customer corpus retained. |
| Benchmark | PASS — 62 retrieval queries: 50 answerable, 10 no-answer, 2 cross-scope. |
| FIRST baseline | Preserved — Top-1 0%, Recall@3 0%; [`first-run.json`](../../evals/retrieval/reports/first-run.json) is immutable after creation. |
| FINAL baseline | PASS — Top-1 96%, Recall@3 100%, no-answer rejection 100%, wrong evidence 0%. |
| Scope/security | PASS — tenant leakage 0%, store leakage 0%, unauthorized exposure 0%. |
| Runtime grounding | PASS — every V2.1 case runs through `SupportAgentRuntime`, Pi tool events, and persisted `support-agent.audit`; unsupported business facts 0%, evidence and version trace accuracy 100%. |
| V0–V2 regression | PASS — V1 30/30, V1.1 100/100, V1.2 60/60, V2 knowledge 46/46. |
| Unit/runtime suite | PASS — 135/135 tests. |
| Build/check/integrity | PASS — exact Pi dependency pins remain `0.84.3`; one product runtime and no copied Pi core. |

## Release verification rule

Before release tagging, a fresh clone of the exact final commit must pass `npm ci --ignore-scripts`, tests, build, check, integrity, V1/V1.1/V1.2/V2 regressions, and the V2.1 retrieval benchmark. The exact pushed final commit must then pass the GitHub Actions clean-runner Gate. This report is committed before that external exact-commit result; the annotated V2.1 tag is created only after the external gate is green.

## Retrieval decision

`DETERMINISTIC LEXICAL RETRIEVAL SUFFICIENT FOR CURRENT PUBLIC PILOT`

That conclusion is limited to this controlled public benchmark. It does not claim vector retrieval will never be needed, and it does not make any store policy or professional-safety claim.
