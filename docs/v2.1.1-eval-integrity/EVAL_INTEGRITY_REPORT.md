# V2.1.1 Evaluation Integrity & Evidence Precision Report

## Corrected evaluation boundary

V2.1.1 does not change retrieval ranking, public corpus facts, `SupportAgentRuntime`, Pi integration, or the frozen V2.1 tag. It replaces runtime-evaluation constants and the shared `passRate` alias with per-case measurements derived from the actual `SupportResult`, real Pi tool-event trace, persisted `support-agent.audit.grounding.evidence`, and the governed corpus reference.

Unauthorized FAQ model exposure is deliberately not reported by the public-retrieval evaluator. It remains governed by the V2.0.1 FAQ-admission regression (`npm run eval:knowledge`), which uses the production FAQ admission path. This avoids duplicating a second FAQ-governance implementation in V2.1.1.

## Formulas

- Unsupported Business Fact Rate: runtime cases whose customer-visible `answer` exposes untrusted provider text, has no evidence but contains a business factual claim, or differs from the exact text authorized by its actual corpus evidence, divided by all runtime cases.
- Evidence Trace Accuracy: answerable cases require every expected evidence ID in `SupportResult.evidence` and an exact structured audit match; no-answer cases require empty result and audit evidence.
- Evidence Version Trace Accuracy: each actual result reference and each audit reference must exactly match a governed corpus `id`, `version`, `sourceRef`, and `kind`.
- No-Evidence Fail-Closed Rate: only expected-no-answer cases are counted; each must return `fallback`, empty result/audit evidence, and no surfaced untrusted provider text.
- Evidence Precision: valid gold evidence IDs returned for answerable cases divided by all evidence records returned for those cases.
- Extraneous Evidence Rate: `1 - evidencePrecision`.

## V2.1 retrieval metrics retained

| Metric | Result |
| --- | ---: |
| Answerable cases | 50 |
| Top-1 hits | 48 |
| Top-1 Hit Rate | 96% |
| Recall@3 | 100% |
| Legacy `wrongEvidenceRate` | 0% |
| Evidence Precision | 61.7284% |
| Extraneous Evidence Rate | 38.2716% |
| Mean returned evidence count | 1.62 |

`wrongEvidenceRate` remains backward-compatible: it records a returned complete wrong-evidence condition (or returned evidence for a no-answer case), not every extra non-gold item. Evidence precision and extraneous evidence measure that separate property.

## Independently measured runtime metrics

| Metric | Result |
| --- | ---: |
| Unsupported Business Fact Rate | 0% |
| Evidence Trace Accuracy | 100% |
| Evidence Version Trace Accuracy | 100% |
| No-Evidence Fail-Closed Rate | 100% |

## Negative controls

The V2.1.1 test suite proves the evaluator detects: an unsupported factual sentence; result/audit evidence divergence; correct ID with a wrong version; correct ID with a wrong source reference; and a no-evidence case that returns a factual answer. The aggregate negative-control summary produces a non-zero unsupported-business-fact rate, a no-evidence fail-closed rate below 100%, and `gatePassed: false`.

## Known limitation

The measured 38.2716% extraneous-evidence rate identifies a future answer-selection/retrieval-quality opportunity. V2.1.1 intentionally does not change aggregation or ranking to address it. The retained `public-24` and `public-30` cases are the evidence for that successor decision.
