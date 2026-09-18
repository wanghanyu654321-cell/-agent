# V2.1.1 Evaluation Integrity Source Audit

## Frozen input verified

- Branch point: `customer-support-agent-v2.1-public-retrieval^{}` = `9a7872004399ad55b8bd5dbeaffc073b68f0c641`.
- V2.1 tag object remains `f73a73caeaaab62979000ec7c7a063773558b1fe`; it is not moved by this branch.
- The V0 through V2.0.1 historical peeled tags remain the values enforced by `scripts/verify-integrity.mjs`.
- `package.json` pins `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, and `@earendil-works/pi-coding-agent` exactly to `0.84.3`.
- `scripts/verify-integrity.mjs` verifies one `SupportAgentRuntime`, Pi dependency pins, no vendored Pi core, and no customer-facing write/shell tools.

## Read implementation paths

- `src/index.ts` owns the sole runtime, Pi Agent construction, tool execution, governed grounding, `SupportResult.evidence`, and persisted `support-agent.audit.grounding.evidence`.
- `src/knowledge.ts` owns governed admission and the stable structured grounding reference: `id`, `version`, `sourceRef`, and `kind`.
- `src/retrieval-eval.ts` owns retrieval Top-1, Recall@3, no-answer, scope, and legacy `wrongEvidenceRate` calculations.
- `evals/retrieval/public-benchmark.ts` runs the public 62-case retrieval benchmark and a real `SupportAgentRuntime`/Pi-tool/audit loop.
- `evals/retrieval/run-public-benchmark.ts` preserves the existing FIRST and V2.1 FINAL reports and writes the V2.1.1-only generated report.

## V2.1 behavior preserved

The historical FIRST report is read-only evidence. The FINAL retrieval result has 50 answerable cases, 48 Top-1 hits, two Top-1 misses (`public-24` and `public-30`), Top-1 96%, and Recall@3 100%. V2.1.1 must preserve those result values and must not tune query-specific retrieval behavior.

`wrongEvidenceRate` currently means a returned complete wrong-evidence condition: for an answerable case a non-empty returned set contains no expected evidence, or a no-answer case returned evidence. It does not count an empty answerable result and does not measure whether every returned item is relevant. V2.1.1 adds precision separately instead of changing this legacy semantic.

## Issue and minimal boundary

The current runtime evaluator stores only a combined `pass` flag. It sets unsupported-business-fact and FAQ-exposure metrics to constants, and aliases evidence trace, evidence-version trace, and no-evidence fail-closed metrics to that combined pass rate. These metric values are therefore not independently measured.

V2.1.1 will change evaluation-only code and tests so each metric is derived from per-case observable runtime output, Pi tool events, and persisted audit evidence. It will not alter retrieval ranking, corpus facts, runtime architecture, tool boundaries, FAQ-admission architecture, or the V2.1 tag.
