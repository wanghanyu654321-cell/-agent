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
BASELINE FREEZE CANDIDATE — FINAL EXACT CLEAN-RUNNER GATE REQUIRED BEFORE TAGGING

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
