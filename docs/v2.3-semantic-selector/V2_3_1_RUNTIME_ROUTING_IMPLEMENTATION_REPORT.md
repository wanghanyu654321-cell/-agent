# V2.3.1 Bounded Runtime Evidence Routing Implementation Report

## Scope and status

This checkpoint implements only the deterministic ordinary-knowledge routing
described in `V2_3_1_RUNTIME_INTEGRATION_DESIGN.md`. It makes zero real model
calls and zero semantic-selector calls. It does not change retrieval ranking,
the selector, prompts, provider/model, timeouts, Pi dependencies, Safety, or
FAQ admission.

The frozen V2.3.1 final unseen Gate remains **INFRASTRUCTURE BLOCKED**. This
checkpoint is a runtime integration candidate for independent review; it is
not a release authorization.

## Implemented route

`search_knowledge` now follows this order:

```text
RetrievalService.search
  -> raw evidence retained for independent Safety extraction
  -> ordinary admission via isAdmissibleKnowledgeEvidence
  -> candidate-count routing before Pi tool-result construction
  -> only authorized ordinary content may reach Pi
```

| Admitted ordinary candidates | Decision | Pi-visible ordinary body | `SupportResult.evidence` |
| ---: | --- | --- | --- |
| 0 | `NO_CANDIDATE` | none | `[]` |
| 1 | `SINGLE_CANDIDATE` | that one body only | the actual grounded reference only |
| 2 or more | `AMBIGUOUS_MULTIPLE_CANDIDATES` | none | `[]` |

The count is over governed ordinary candidates only: rejected lifecycle state,
synthetic production fixtures, cross-tenant/store evidence, and safety-only
evidence do not become candidates. More than three admitted candidates fail
closed just like two or three; no Top-1 fallback or concatenation exists.

## Audit contract

`support-agent.audit.knowledgeRouting` adds:

- `admittedCandidateCount`
- `candidateEvidenceIds`
- `decision`
- `semanticSelectorInvoked: false`
- `eligibleEvidenceIds`
- `authorizedEvidenceIds`

`eligibleEvidenceIds` records the one admitted candidate on the deterministic
single-candidate route. `authorizedEvidenceIds` is derived from the final
`SupportResult.evidence`, so Safety escalation/handoff precedence can make an
otherwise eligible candidate unauthorized. Existing `grounding` continues to
record actual evidence ID, version, source reference, and kind. FAQ does not
write `knowledgeRouting` and retains its independent pre-model admission path.

## Acceptance mapping

| # | Exact test / assertion |
| ---: | --- |
| 1 | `bounded runtime evidence routing > keeps zero raw...`: empty retrieval yields fallback and `evidence: []`. |
| 2 | The same test: rejected raw records yield `NO_CANDIDATE`. |
| 3 | `... > exposes only one governed candidate...`: one admitted record yields one answer reference. |
| 4 | `... > fails closed... for 2`: two admitted records yield fallback. |
| 5 | `... > fails closed... for 3`: three admitted records yield fallback. |
| 6 | `... > fails closed... for 4`: unexpected generic-service cardinality also fails closed. |
| 7 | The zero-admitted fixture includes `cross-tenant`; its body is absent from Pi session data. |
| 8 | The zero-admitted fixture includes `cross-store`; its body is absent from Pi session data. |
| 9 | The zero-admitted fixture includes `unapproved`; its body is absent from Pi session data. |
| 10 | The zero-admitted fixture includes `retired`; its body is absent from Pi session data. |
| 11 | The zero-admitted fixture includes production-disallowed `synthetic_test_only`; its body is absent. |
| 12 | The single-candidate test asserts `ONLY_ACCEPTED_BODY` is present and `REJECTED_BODY` absent. |
| 13 | The two-candidate test asserts neither `AMBIGUOUS_BODY_*` body reaches persisted Pi messages. |
| 14 | The three-candidate test makes the same persisted-Pi assertion. |
| 15 | The two/three/four-candidate assertions require fallback and empty evidence, excluding Top-1 fallback. |
| 16 | Every `knowledgeRouting` audit assertion requires `semanticSelectorInvoked: false`; `src/index.ts` imports no selector. |
| 17 | The zero-raw and zero-admitted assertions require `SupportResult.evidence = []`. |
| 18 | The single-candidate assertion requires exactly its ID/version/sourceRef/kind reference. |
| 19 | Each ambiguous-cardinality assertion requires `SupportResult.evidence = []`. |
| 20 | Zero-admitted audit assertion requires `NO_CANDIDATE`, empty candidate/eligible/authorized IDs. |
| 21 | Single-candidate audit assertion requires `SINGLE_CANDIDATE`, exact eligible and authorized ID. |
| 22 | Ambiguous audit assertions require `AMBIGUOUS_MULTIPLE_CANDIDATES`, empty eligible/authorized IDs. |
| 23 | Rejected and ambiguous body absence in actual Pi session messages proves audit/session contain no candidate body; no test supplies hidden reasoning. |
| 24 | `... > keeps FAQ on its existing pre-model admission path...` asserts `knowledgeRouting` is absent; `faq-admission.test.ts` remains green. |
| 25 | Cross-tenant/store fixture plus `faq-admission.test.ts` scope cases remain green. |
| 26 | `... > keeps a single ordinary candidate eligible but unauthorized when safety escalation wins` preserves Safety precedence. |
| 27 | `safety-runtime.test.ts` full regression preserves pause/escalate fail-closed paths. |
| 28 | `support-agent-runtime.test.ts` full regression preserves ticket/handoff authorization and concurrent idempotency. |
| 29 | `support-agent-runtime.test.ts` full regression preserves per-tool and overall timeout/cancellation tests. |
| 30 | Full `npm test` runs all governed knowledge, FAQ, Safety, V1/V1.1/V1.2, V2, public retrieval, and integrity test suites. |

The Safety regression specifically proves that raw safety evidence is extracted
before ordinary routing and that a Safety escalation produces an empty final
ordinary authorization list even when one ordinary candidate was eligible.

The V2.1 public runtime benchmark retains its historical retrieval-quality
measurements. Its runtime observation now separately records legacy
`evidenceTraceAccuracy` and the stronger `routedOutcomeAccuracy`: a public
answerable query with multiple admitted candidates is a correct fail-closed
runtime outcome only when it returns no evidence, no provider text, and an
ambiguous routing audit. A non-ambiguous route must still satisfy the
historical expected-evidence trace contract; a valid version/source reference
for the wrong corpus evidence does not count as routed-correct. This makes the
deliberate loss of multi-candidate answer coverage visible without masking a
single-candidate evidence-selection error as a retrieval-quality success.

## Explicitly unchanged

- No semantic selector call or hot-path dependency.
- No prompt, parser, retrieval ranker, provider/model, timeout, or Pi change.
- No FAQ admission change.
- No Safety policy change.
- No release tag, merge, or release.
