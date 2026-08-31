# V2.3.1 Offline Runtime Integration Design

## 1. Decision summary and authorization state

This is a design checkpoint only. It authorizes neither Runtime Integration nor
any model call.

```text
V2.3.1 LATENCY CHARACTERIZATION = APPROVED AS DESIGN INPUT

MANDATORY SYNCHRONOUS SEMANTIC SELECTOR =
NOT RUNTIME ELIGIBLE UNDER CURRENT BUDGET

V1 RUNTIME ROUTING DESIGN =
0 candidates -> fail closed
1 candidate -> preserve governed single-evidence path
2-3 candidates -> ambiguous, no evidence authorized

SYNCHRONOUS SEMANTIC SELECTOR CALLS = 0
ASYNC SEMANTIC SUBSYSTEM = NOT AUTHORIZED
RUNTIME IMPLEMENTATION = NOT YET AUTHORIZED
FINAL TRUE UNSEEN GATE = INFRASTRUCTURE BLOCKED
RELEASE = NOT AUTHORIZED
```

The frozen final true unseen Gate is neither a PASS nor a semantic FAIL. Its
single durable first-exposure attempt has 20 persisted records and a timeout;
no missing identity may be inferred or retried. See
[FINAL_TRUE_UNSEEN_GATE_REPORT.md](FINAL_TRUE_UNSEEN_GATE_REPORT.md).

## 2. Observed latency and current runtime constraints

The controlled latency characterization used `openai-codex/gpt-5.6-sol` and
the frozen `v2.3.1` prompt on ten already-exposed inputs, three sequential
rounds each. It observed P50 `7354ms`, P95 `16665ms`, maximum `27779ms`, one
provider error out of 30 calls, and zero timeouts at its evaluation-only
`30000ms` observation boundary. Counterfactual exceedance was 30/30 at 2s,
25/30 at 6s, 11/30 at 8s, 5/30 at 10s, and 2/30 at 15s. The durable evidence
and its full table are in
[V2_3_1_LATENCY_CHARACTERIZATION_REPORT.md](V2_3_1_LATENCY_CHARACTERIZATION_REPORT.md).

The actual runtime defaults in [`src/index.ts`](../../src/index.ts) are:

| Constraint | Current value |
| --- | ---: |
| `overallTurnTimeoutMs` | `10000ms` |
| `perToolTimeoutMs` | `2000ms` |
| semantic-selector default timeout | `2000ms` |

Therefore `openai-codex/gpt-5.6-sol` semantic selection is **not authorized as
a mandatory synchronous hot-path dependency** in the current ten-second
`SupportAgentRuntime`. This is a compatibility conclusion about the measured
path and current budget, not a provider-quality or model-quality claim.

The current semantic-selector timeout is not a proposed runtime budget.
Increasing it to 10–15 seconds would conflict with the existing ten-second
customer-support turn budget, so it is not the selected V1 architecture.
This design changes none of those values.

## 3. Current source facts and implementation seam

`SupportAgentRuntime.run()` detects a safety risk before constructing its Pi
Agent, records general grounding callbacks during tool execution, then gives
safety disposition precedence after the Agent turn and before the ordinary
grounding result. It returns governed evidence bodies directly rather than a
model-composed factual answer when `verifiedKnowledgeEvidence` is true.

The future implementation seam is only the normal-knowledge portion of
`SupportAgentRuntime.createTools()`:

1. `search_knowledge` invokes `RetrievalService.search()` with tenant/store
   context.
2. The existing run callback applies status, synthetic-fixture, tenant, and
   store admission through `isAdmissibleKnowledgeEvidence`.
3. Today, the unfiltered retrieval evidence is still rendered into the Pi tool
   result in `search_knowledge` before that callback decides grounded output.

Any future implementation must insert the candidate-count routing decision
**after governed admission and before both the Pi tool result body and the
ordinary grounding callback**. It must not be an output guard that runs after
Pi has already received candidate text.

`GovernedKnowledgeRetrievalService` already preserves lifecycle and scope
admission and may return a relevance-ranked Top3. That ranking may define the
bounded candidate set; it must not authorize rank 1 when the set has two or
three admitted candidates.

## 4. Candidate-count routing state machine

```text
search_knowledge
  -> existing lifecycle / tenant / store / synthetic admission
  -> admitted candidate count
     0 -> NO_CANDIDATE
     1 -> SINGLE_CANDIDATE
     2-3 -> AMBIGUOUS_MULTIPLE_CANDIDATES
```

| State | Synchronous selector calls | Pi-visible ordinary knowledge | Authorized evidence | Required result behavior |
| --- | ---: | --- | --- | --- |
| `NO_CANDIDATE` | 0 | none | `[]` | Preserve current controlled no-evidence fallback/escalation behavior. |
| `SINGLE_CANDIDATE` | 0 | the one admitted body only | that exact ID only if it actually grounds the returned answer | Preserve the existing governed single-evidence path and output guards. |
| `AMBIGUOUS_MULTIPLE_CANDIDATES` | 0 | none | `[]` | Fail closed as `AMBIGUOUS_GROUNDED_EVIDENCE`; no single factual evidence is authorized. |

For two or three admitted candidates, the runtime must not select lexical Top1,
concatenate candidates, expose all bodies to Pi, silently select rank 1, wait
for the semantic selector, or increase the global turn budget. `SupportResult`
must expose `evidence: []` unless another independently authorized evidence
path applies.

The single-candidate route is a preservation route, not a new assertion that
one retrieved candidate is always semantically perfect.

## 5. Safety precedence

Safety remains independent and higher-authority than ordinary knowledge
routing. The actual ordering is:

```text
detectSafetyRisk(request.text)
  -> Pi tool execution may retrieve SafetyEvidence
  -> decideSafety(risk, evidence, false, "pause")
  -> supported answer from approved options OR pause + qualified-human handoff
  -> ordinary knowledge fallback/grounding only when no safety disposition applies
```

Safety evidence is evaluated by risk category, approval/synthetic-test policy,
scope, allowed options, and explicit escalation requirement. Missing,
insufficient, or escalation-required safety evidence produces the existing
pause-and-qualified-human escalation. The selector is not a prerequisite for
safety escalation and must not route safety through candidate-count ambiguity
in a future implementation.

## 6. FAQ boundary

FAQ remains a separate pre-model admission path. In `search_faq`, matching FAQ
entries are converted to governed metadata, then the first entry passing
lifecycle status, tenant/store scope, and synthetic-test policy is selected
before its answer is returned as a Pi tool result. Rejected FAQ text must not
reach the Pi session; the existing unauthorized FAQ model-exposure contract is
zero.

This design does not send FAQ admission through semantic selection and does not
reuse ordinary knowledge ambiguity routing to reopen the historical FAQ
exposure defect. FAQ and general knowledge share the same status/scope/synthetic
admission rule, while their current candidate-selection mechanics remain
separate.

## 7. Pi exposure and SupportResult contracts

For ordinary knowledge with two or three admitted candidates, **Pi receives no
candidate evidence body as customer-answer grounding context or tool-result
text**. The ambiguity decision must therefore precede the current
`evidence.map((item) => item.text).join("\\n")` construction in
`search_knowledge`.

`SupportResult.evidence` remains a record of evidence actually used, with ID,
version, source reference, and kind. Future routing must preserve these exact
invariants:

```text
NO_CANDIDATE                  -> SupportResult.evidence = []
SINGLE_CANDIDATE              -> at most the actual grounded single reference
AMBIGUOUS_MULTIPLE_CANDIDATES -> SupportResult.evidence = []
```

No unselected or rejected candidate may appear in `SupportResult.evidence`.

## 8. Minimal future audit contract

The existing `support-agent.audit` entry already records ordinary grounding
query, admissibility, and evidence references, plus observable safety
decisions. A future implementation may add only non-sensitive routing metadata:

```text
knowledgeRouting:
  admittedCandidateCount: number
  candidateEvidenceIds: string[]
  decision: NO_CANDIDATE | SINGLE_CANDIDATE | AMBIGUOUS_MULTIPLE_CANDIDATES
  semanticSelectorInvoked: false
  authorizedEvidenceIds: string[]
```

Required alignment:

| Decision | `semanticSelectorInvoked` | `authorizedEvidenceIds` |
| --- | --- | --- |
| `NO_CANDIDATE` | `false` | `[]` |
| `SINGLE_CANDIDATE` | `false` | exact single ID |
| `AMBIGUOUS_MULTIPLE_CANDIDATES` | `false` | `[]` |

The audit must not duplicate candidate bodies or persist hidden reasoning. When
evidence is authorized, existing version, sourceRef, kind, tenant/store
grounding identity, and actual `SupportResult.evidence` remain aligned.

## 9. Future implementation acceptance matrix

The successor code phase must add tests without weakening existing assertions.

| # | Required test |
| ---: | --- |
| 1 | 0 raw retrieval results. |
| 2 | Raw results but 0 governed-admitted candidates. |
| 3 | Exactly 1 admitted candidate. |
| 4 | Exactly 2 admitted candidates. |
| 5 | Exactly 3 admitted candidates. |
| 6 | More than 3 raw results while governed retrieval retains its Top3 boundary. |
| 7 | Cross-tenant candidate rejection. |
| 8 | Cross-store candidate rejection. |
| 9 | Unapproved candidate rejection. |
| 10 | Retired candidate rejection. |
| 11 | Synthetic candidate rejection in production mode. |
| 12 | The single candidate is the only Pi-visible ordinary knowledge evidence. |
| 13 | Two admitted candidates: neither body reaches Pi. |
| 14 | Three admitted candidates: no body reaches Pi. |
| 15 | Ambiguity never falls back to rank 1. |
| 16 | Synchronous semantic-selector invocation count is zero on every route. |
| 17 | 0 candidates produce `SupportResult.evidence = []`. |
| 18 | 1 candidate exposes only actual grounded evidence. |
| 19 | 2–3 ambiguous candidates produce `SupportResult.evidence = []`. |
| 20 | `NO_CANDIDATE` audit alignment. |
| 21 | `SINGLE_CANDIDATE` audit alignment. |
| 22 | `AMBIGUOUS_MULTIPLE_CANDIDATES` audit alignment. |
| 23 | Audit has neither candidate text nor hidden reasoning. |
| 24 | FAQ unauthorized model exposure remains zero. |
| 25 | Tenant/store isolation remains unchanged. |
| 26 | Safety behavior remains unchanged. |
| 27 | Professional-safety fail-closed behavior remains unchanged. |
| 28 | Ticket and handoff authorization/idempotency remain unchanged. |
| 29 | Overall-turn and per-tool timeout behavior remains unchanged. |
| 30 | Historical V2.0.1, V2.1.1, Safety, and governed-knowledge regressions remain green. |

## 10. Explicitly out of scope

- Runtime integration or a production default change.
- Any synchronous semantic-selector call.
- Background queues, workers, event buses, callbacks, or delayed answer mutation.
- A second Agent, LLM judge, provider pool, speculative parallel selection, or
  async semantic subsystem.
- Embeddings, vector database, semantic reranker service, retrieval-score
  change, prompt change, provider/model change, or timeout tuning.
- Safety policy, FAQ admission, Pi dependencies, tag, merge, or release.

## 11. Validation required for this design checkpoint

The design checkpoint is valid only with unchanged runtime source and zero new
model calls, while `npm test`, `npm run build`, `npm run check`, and
`npm run integrity` pass. Pi remains pinned to exact `0.84.3`.

CUSTOMER SUPPORT AGENT V2.3.1

OFFLINE RUNTIME INTEGRATION DESIGN COMPLETE

MANDATORY SYNCHRONOUS SEMANTIC SELECTOR NOT AUTHORIZED

RUNTIME IMPLEMENTATION NOT YET AUTHORIZED

FINAL TRUE UNSEEN GATE REMAINS INFRASTRUCTURE BLOCKED

RELEASE NOT AUTHORIZED
