# V2.0 Governed Knowledge Evaluation Specification

Run `npm run eval:knowledge`. The 40 controlled cases in `evals/knowledge/cases.ts` use the actual `SupportAgentRuntime`, Pi Agent tool calls under the deterministic faux provider, persisted `support-agent.audit`, actual final output, `SupportResult.evidence`, and actual handoff-store state. This is not a helper-only test.

The corpus has four admitted FAQ cases, four admitted policy cases, four admitted SOP cases, four no-evidence cases, and three cases each for unapproved, synthetic-in-production, retired, wrong-tenant, wrong-store, injection, invented-answer, and citation-bypass controls. All corpus content is labelled controlled and synthetic-test-only; it contains no production professional or business facts.

The evaluator requires the expected tool event, outcome, evidence ID/version/source reference/kind, audit trace, and absence of an unexpected handoff. Its negative controls deliberately make fabricated admission, wrong evidence ID/version, wrong tenant, unapproved evidence, and an invented no-evidence answer fail evaluation.

Metrics are: total cases; pass rate; admitted-evidence usage rate; rejected-unapproved/synthetic/retired rates; cross-tenant/store leakage rates; unsupported business-fact rate; audit evidence trace accuracy; evidence-version trace accuracy; and no-evidence fail-closed rate. The Gate requires 40+ cases, at least 90% pass/admitted usage, exactly zero acceptance or unsupported-fact rates, and 100% trace/fail-closed rates.
