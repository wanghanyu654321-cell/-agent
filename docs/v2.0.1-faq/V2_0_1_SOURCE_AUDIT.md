# V2.0.1 FAQ Admission Source Audit

## Baseline and boundary

V2.0.1 starts from the immutable `customer-support-agent-v2.0-knowledge` tag, which peels to `98cca9b92c13c2639beb958177923b3c09b42ed9`. All changes are on `fix/v2.0.1-faq-admission`. The V2.0 tag is included in the integrity gate and is not moved by this work.

Pi packages remain exact `0.84.3` dependencies. No Pi source is copied or modified; Pi remains the generic Agent and persisted-session runtime.

## Files read before modification

- `src/index.ts` and `src/knowledge.ts`
- `tests/support-agent-runtime.test.ts`, `tests/governed-grounding-runtime.test.ts`, and `tests/governed-knowledge.test.ts`
- `tests/knowledge-eval.test.ts`, `evals/knowledge/cases.ts`, and `evals/knowledge/runner.ts`
- `docs/v2.0-knowledge/KNOWLEDGE_CONTRACT.md` and `docs/v2.0-knowledge/V2_0_GATE_REPORT.md`
- `.github/workflows/customer-support-agent-gate.yml`, `scripts/verify-integrity.mjs`, `package.json`, and `tsconfig.json`

## Defect reproduced

Before V2.0.1, `search_faq` selected the first question-matching `FaqEntry`, returned its `answer` in the Pi tool result, and only then called the shared grounding admission path. A tenant/store mismatch, retired entry, unapproved entry, or production synthetic fixture could therefore appear in the persisted Pi session even though the final result later failed closed.

The new `tests/faq-admission.test.ts` was written before the runtime change. Against the old code, its cross-tenant, cross-store, unapproved, retired, and synthetic-production cases failed because the rejected answer was present in the Pi session. The test also covers an unauthorized first candidate followed by an authorized second candidate.

## Reused V2 primitives

- `isAdmissibleKnowledgeEvidence()` is the only FAQ admission decision: it checks lifecycle status, explicit synthetic-test allowance, and tenant/store scope.
- `onKnowledgeEvidence()` remains the sole path that sets verified evidence, `SupportResult.evidence`, and `support-agent.audit.grounding`.
- Existing Pi Agent tool events, session persistence, output guards, and `SupportAgentRuntime` are retained. No second runtime, tool registry, retrieval path, or model-ranking logic was added.

## Corrected flow

`search_faq` now performs deterministic question matching, transforms each candidate to governed evidence metadata, applies the existing admission function, and selects the first admissible candidate. Only that candidate's text is returned to Pi. If none is admissible, the tool returns exactly `No FAQ evidence found.` and the existing no-evidence fail-closed path runs.
