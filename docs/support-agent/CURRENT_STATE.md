# Customer Support Agent Current State

## Status

CUSTOMER SUPPORT AGENT RUNTIME V0
INDEPENDENT REPOSITORY BASELINE FROZEN

V1 Safety Vertical Slice is additive work on `feat/v1-safety-vertical-slice`; the V0 tag remains unchanged. Its controlled safety Gate is recorded in [V1_GATE_REPORT.md](../v1-safety/V1_GATE_REPORT.md): professional-safety risk is evidence-gated, synthetic knowledge is production-rejected, and missing/partial evidence pauses and escalates through the existing handoff path.

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
