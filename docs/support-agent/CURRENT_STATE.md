# Customer Support Agent Current State

## Status

CUSTOMER SUPPORT AGENT RUNTIME V0
INDEPENDENT REPOSITORY BASELINE FROZEN

V1 Safety Vertical Slice is additive work on `feat/v1-safety-vertical-slice`; the V0 tag remains unchanged. Its controlled safety Gate is recorded in [V1_GATE_REPORT.md](../v1-safety/V1_GATE_REPORT.md): professional-safety risk is evidence-gated, synthetic knowledge is production-rejected, and missing/partial evidence pauses and escalates through the existing handoff path.

V1.1 Safety Robustness Hardening is additive work on `feat/v1.1-safety-robustness` above the frozen V1 tag. Its Gate has passed with a 100-case runtime-derived robustness evaluation: required escalation recall is 100%, unsupported professional-claim rate is 0%, and duplicate handoff count is 0. Its evidence is recorded in [V1_1_GATE_REPORT.md](../v1.1-robustness/V1_1_GATE_REPORT.md). It does not alter the V0 or V1 tags, Pi core, the single runtime architecture, or the policy that real professional knowledge must be approved separately.

V1.2 Blind Validation & Independent CI is additive work on `feat/v1.2-blind-eval-ci` above the frozen V1.1 tag. It adds a separated 60-case blind safety holdout, including hard-negative and adversarial cases, plus a clean-runner GitHub Actions Gate. The immutable first blind result and final local result are recorded in [V1_2_GATE_REPORT.md](../v1.2-validation/V1_2_GATE_REPORT.md). The independent clean-runner workflow passed for both the code checkpoint ([run 33141444321](https://github.com/wanghanyu654321-cell/-agent/actions/runs/33141444321)) and the final documentation checkpoint ([run 33141608880](https://github.com/wanghanyu654321-cell/-agent/actions/runs/33141608880)). V1.2 does not alter the V0, V1, or V1.1 tags, Pi core, the product runtime architecture, or the rule that only independently governed approved knowledge may support professional guidance.

V2.0 Governed Knowledge Grounding is additive work on `feat/v2.0-knowledge-grounding` above frozen V1.2. It applies the same approval, version, source-reference, and tenant/store-scope admission rule to both FAQ and general knowledge; a non-empty retrieval cannot independently authorize a factual answer. `SupportResult` and persisted `support-agent.audit` carry the actual grounded evidence ID, version, source reference, and kind. Its local, clean-clone, and GitHub Actions evidence is recorded in [V2_0_GATE_REPORT.md](../v2.0-knowledge/V2_0_GATE_REPORT.md).

CUSTOMER SUPPORT AGENT V2.0
GOVERNED KNOWLEDGE GROUNDING
INDEPENDENT REPOSITORY BASELINE FROZEN

V2.0.1 FAQ Admission Hardening is additive work on `fix/v2.0.1-faq-admission` above the immutable V2.0 tag. It closes a pre-model ordering gap in `search_faq`: lifecycle, tenant/store scope, and explicit synthetic-test admission are decided before any FAQ answer is returned in a Pi tool result. Rejected FAQ text cannot establish verified evidence or enter the persisted Pi session; only an admitted candidate is traceable through `SupportResult.evidence` and `support-agent.audit.grounding`. The expanded V2.0.1 controlled evaluation records `Unauthorized FAQ Model Exposure Rate = 0%`. Its source audit, admission contract, and Gate evidence are recorded under [docs/v2.0.1-faq](../v2.0.1-faq/).

CUSTOMER SUPPORT AGENT V2.0.1
FAQ ADMISSION HARDENING
INDEPENDENT REPOSITORY BASELINE FROZEN

The historical V2.0.1 result is now recorded forward: `customer-support-agent-v2.0.1-faq-admission` is an annotated tag that peels to `f8a5498ddae424246a9e32fcc430d186573d9d55`; the final exact GitHub Actions clean-runner [run 33182655801](https://github.com/wanghanyu654321-cell/-agent/actions/runs/33182655801) passed before that tag was created. The Knowledge Governance Foundation is CLOSED.

V2.1 Real Knowledge & Retrieval Quality now runs a bounded public real-world benchmark on `feat/v2.1-real-knowledge-retrieval` by explicit product decision. It uses public official local-services knowledge and realistic, de-identified customer-query scenarios; it does not claim a real store policy, customer production data, or production validation for a beauty store. The original private-source blocker remains historical evidence, while current public-source provenance and reports are recorded in [docs/v2.1-retrieval](../v2.1-retrieval/).

V2.1.1 Evaluation Integrity & Evidence Precision is additive work on `fix/v2.1.1-eval-integrity` above the frozen V2.1 tag. It measures public-runtime evidence and audit properties independently, adds precision/extraneous-evidence metrics, and preserves V2.1 retrieval behavior. Its source audit and candidate Gate evidence are recorded in [docs/v2.1.1-eval-integrity](../v2.1.1-eval-integrity/).

V2.2 Deterministic Evidence Selection was assessed on `feat/v2.2-evidence-selection` without changing frozen candidate scoring, ordering, corpus, or entering a selector into the customer runtime. The complete score/margin analysis shows that the current admissible deterministic score signals cannot simultaneously reach zero wrong selections, at least 95% correct selection, and at least 95% answerable coverage without an arbitrary benchmark-derived exception. The V2.2 success Gate is therefore not passed, no V2.2 release tag exists, and the recorded decision is [SEMANTIC EVIDENCE SELECTION JUSTIFIED](../v2.2-selection/SELECTION_DECISION.md). Candidate score/rank metadata is retained only as non-business runtime metadata for a separately scoped successor analysis; Safety, FAQ admission, customer answer composition, and historical behavior remain unchanged.

V2.3 Lightweight Semantic Evidence Selector starts from the V2.2 checkpoint with a bounded provider-independent one-shot classifier contract and offline evaluator. The earlier compat completion path was OAuth-blind and produced Pi error envelopes; the adapter correctly classifies them as provider failures rather than invalid model output. A public Pi `ModelRuntime` control confirms stored OAuth resolution and successful text-envelope delivery for `openai-codex/gpt-5.6-sol`; see [OAUTH_AWARE_COMPLETION_PATH.md](../v2.3-semantic-selector/OAUTH_AWARE_COMPLETION_PATH.md). The first authorized OAuth-aware 44-call Gate process terminated before its final report: its historical runner held traces in memory and used one direct final write rather than per-invocation durable persistence, so no aggregate or per-case quality evidence exists and no historic completion count can be inferred. The later one-time durable Recovery Gate process at `df9cefdd1d10bb8764658798bbdbec766176e5ce` also blocked before any model call: Git worktree ownership protection rejected the runner's `git rev-parse HEAD` provenance command before manifest or journal creation. Thus real semantic calls remain `0`, no durable recovery artifacts exist, and no retry is authorized. The selector is not integrated into `SupportAgentRuntime`; the V2.3 Gate is **INFRASTRUCTURE BLOCKED**, and **SEMANTIC CAPABILITY NOT YET VALIDLY EVALUATED**. The controlling records are [oauth-aware-semantic-gate-infrastructure-blocked.json](../../evals/selection/semantic/reports/oauth-aware-semantic-gate-infrastructure-blocked.json) and [GATE_EVIDENCE_DURABILITY.md](../v2.3-semantic-selector/GATE_EVIDENCE_DURABILITY.md).

The later recovery-2 authorization fixed only the repository-scoped Git provenance call and ran from committed clean source `edb70e6c9d7e5b48defd5e42708e591d337bae4d`. Its write-once manifest, 44-record fsync-backed journal, and derived final report are complete. With `openai-codex/gpt-5.6-sol`, prompt `v2.3.0`, and all frozen inputs unchanged, it had no provider errors, timeouts, invalid outputs, wrong selections, or order-induced wrong selections. It nevertheless missed the frozen quality threshold: `correctSelectionRate = 0.96` versus required `>= 0.98`, due to `public-04/primary`, `public-04/reversed`, and `public-28/primary` abstentions. The controlling V2.3 result is **SEMANTIC SELECTOR OFFLINE GATE FAILED**. The selector remains outside `SupportAgentRuntime`; no tuning, retry, runtime integration, or V2.3 release tag is authorized. See [oauth-aware-semantic-gate-recovery-2-run.json](../../evals/selection/semantic/reports/oauth-aware-semantic-gate-recovery-2-run.json) and [GATE_EVIDENCE_DURABILITY.md](../v2.3-semantic-selector/GATE_EVIDENCE_DURABILITY.md).

The subsequent offline benchmark-contract audit found 41 direct-and-sufficient cases and 9 PARTIAL cases among the 50 frozen answerable queries. Only `public-04/primary` and `public-28/primary` lower the 50-case primary correct-selection rate; `public-04/reversed` is an order diagnostic. The benchmark is **PARTIALLY VALID** for semantic sufficiency, while the frozen Recovery-2 Gate remains **FAILED**. The selector is still not integrated into `SupportAgentRuntime`; no rerun, tuning, tag, or release is authorized. See [BENCHMARK_CONTRACT_AUDIT.md](../v2.3-semantic-selector/BENCHMARK_CONTRACT_AUDIT.md).

Audit V2 supersedes Audit V1's consistency interpretation: its explicit 50-case findings are 37 SUPPORTED, 13 PARTIAL, 0 UNSUPPORTED. It keeps the primary-rate correction and the immutable Recovery-2 **FAILED** result. The benchmark is **PARTIALLY VALID**; no runtime integration, rerun, tuning, tag, or release is authorized. See [BENCHMARK_CONTRACT_AUDIT_V2.md](../v2.3-semantic-selector/BENCHMARK_CONTRACT_AUDIT_V2.md).

The product source of truth is `wanghanyu654321-cell/-agent`. The Pi working tree at source commit `6026a439cc345969f708a820990dd3fe8d88f0b7` remains historical frozen evidence and a read-only reference implementation checkpoint.

## Included V0 behavior

- Pi Agent execution with primary-provider failure fallback only.
- Pi JSONL session recovery, restored context, and persisted `support-agent.audit` metadata.
- Strict schemas and the four business tools: FAQ search, knowledge search, ticket creation, and human handoff.
- Turn/tool budgets, overall and per-tool timeouts, cancellation, and late-event isolation.
- Ticket and human-handoff duplicate protection, including concurrent attempts.
- Evidence, FAQ-hallucination, and output guards that fail closed.
- Product-owned Skills in `skills/` and a read-only retrieval abstraction.

## Deliberately excluded

No Pi core fork, copied Pi source, vector database, knowledge writes, file/shell/edit customer tools, channel adapters, UI, provider routing, multi-agent architecture, or V1 business features are included.

Fresh evidence is recorded in [TEST_REPORT.md](TEST_REPORT.md) and [EXTRACTION_GATE_REPORT.md](../extraction/EXTRACTION_GATE_REPORT.md).
