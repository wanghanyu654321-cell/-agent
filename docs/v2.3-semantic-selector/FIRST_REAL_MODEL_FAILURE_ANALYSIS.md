# V2.3 First Real-Model Failure Attribution

## Scope and preservation

This is an attribution-only record for the immutable first real-model run. No prompt, parser, selector, retrieval, corpus, benchmark, gold label, or Gate threshold was changed. No additional real-model request was made for this analysis.

| Item | Value |
| --- | --- |
| Source HEAD | `fa4abb3f4dc5a151de005deca2c5538f6e97e719` |
| Provider / model | `openai-codex` / `gpt-5.6-sol` |
| First report | `evals/selection/semantic/reports/first-real-run.json` |
| SHA-256 | `F487652C1EBB50EAC55A77B69660D2B2A85F3B5EFDFBF892C05F45D1F25D6EC3` |
| Report secrets inspection | No OAuth token, API key, authorization header, `auth.json` path, or personal credential data is present. |

The report is committed as historical evidence and is not rewritten by this analysis.

## First-run facts

The stored report records 50 answerable cases, 44 semantic calls, 28 correct selections, no wrong selections, 56% coverage, and a 50% invalid-selector-output rate. The Gate is false because correct selection and coverage are below their respective thresholds and invalid output is non-zero.

The evaluator counts direct single-candidate selections in `selected`, `correct`, and coverage without calling the model. For a multi-candidate case it calls the selector once in original order and once in reversed order, but only the original-order result contributes to selected/correct/wrong/coverage.

| Observable primary-evaluation outcome | Count | Evidence |
| --- | ---: | --- |
| Answerable cases | 50 | Frozen public benchmark |
| Direct single-candidate selections | 28 | Local candidate-distribution recomputation |
| Primary multi-candidate calls | 22 | One per multi-candidate case |
| Reversed-order calls | 22 | One per multi-candidate case |
| Total semantic calls | 44 | First report and evaluator control flow |
| Selected | 28 | `answerableCoverage = 28 / 50 = 0.56` |
| Correct | 28 | `correctSelectionRate = 28 / 50 = 0.56` |
| Wrong | 0 | `wrongSelectionRate = 0` |
| Primary non-selections | 22 | `50 - 28` |
| Primary `invalid` | 22 | `invalidSelectorOutputRate = 22 / 44 = 0.50` |
| Primary explicit `ABSTAIN` | 0 | The 22 non-selections are all accounted for by `invalid`. |
| Primary timeout | 0 | The 22 non-selections are all accounted for by `invalid`. |
| Primary provider error | 0 | The 22 non-selections are all accounted for by `invalid`. |
| Empty-output count | Not observable | Empty text is folded into `invalid`; raw text was not retained. |

The final four rows apply to the original-order evaluation result. The evaluator does not persist per-invocation results for the 22 reversed-order calls. Therefore their individual classifications cannot be recovered from the first report. The aggregate `orderInducedWrongSelectionRate = 0` proves that none of those reversed calls became a wrong selection after an original non-selection, but it does not identify which reversed calls were valid, invalid, abstained, timed out, or errored.

## Candidate distribution and the 44-call question

The V2.3 command was recomputed locally with the exact frozen `publicBenchmarkCases`, `loadPublicBenchmarkEntries()`, `GovernedKnowledgeRetrievalService({ rankByRelevance: true })`, and each case's `tenantId` and `storeId`. This was a retrieval-only calculation; it made no model call.

| Candidate count | Case count | Case IDs |
| ---: | ---: | --- |
| 0 | 0 | None |
| 1 | 28 | `public-06`, `public-07`, `public-08`, `public-09`, `public-13`, `public-14`, `public-17`, `public-19`, `public-20`, `public-21`, `public-22`, `public-23`, `public-25`, `public-29`, `public-35`, `public-36`, `public-37`, `public-38`, `public-39`, `public-40`, `public-41`, `public-42`, `public-43`, `public-44`, `public-46`, `public-47`, `public-48`, `public-50` |
| 2 | 13 | `public-01`, `public-03`, `public-04`, `public-05`, `public-12`, `public-15`, `public-27`, `public-30`, `public-32`, `public-33`, `public-34`, `public-45`, `public-49` |
| 3 | 9 | `public-02`, `public-10`, `public-11`, `public-16`, `public-18`, `public-24`, `public-26`, `public-28`, `public-31` |

There are 22 multi-candidate cases, so the evaluator's expected semantic-call count is `22 x 2 = 44`. The first report's 44 calls are therefore exact, not a runtime discrepancy.

The apparent `25 x 2 = 50` expectation comes from an internal arithmetic error in the prose of the frozen V2.2 score analysis: it says there are 25 one-candidate and 25 multi-candidate cases. Its own table lists the same 22 multi-candidate case IDs above, and its 81 candidate-record total independently requires `28 x 1 + 13 x 2 + 9 x 3 = 81`. The V2.3 recomputation matches that table and the unchanged 81-record V2.2 baseline.

No retrieval-surface file differs between the V2.2 checkpoint `c02a515ce4b8d0206684e6cd3a3cd4f07553ed33` and this V2.3 HEAD. The V2.2 checkpoint is an ancestor of this branch. The first report's `benchmarkHash` is `af35c7c5467fc4d293626044e4a42edc18e068c07ffb95010192bb6b21651137` and its `corpusHash` is `1aecf6ea0270ad48ce111737c6b6acb57a59006ff69f59257cb1c0f7f3e723af`; the V2.3 evaluator hashes exactly the frozen benchmark object and loaded corpus. No environment-dependent retrieval input is used beyond the fixed tenant/store values carried by each benchmark case.

Conclusion: there is no evaluation-input drift. The 44-call count is explained by the actual, unchanged 28/22 candidate distribution.

## Raw output and parser-contract limits

`first-real-run.json` stores aggregate metrics only. Neither `run-real.ts` nor `runSemanticSelectionEvaluation()` records raw selector text, per-case result objects, or per-order traces. It is therefore not possible to retrospectively classify the 44 raw responses as exact JSON, whitespace-wrapped JSON, fenced JSON, JSON plus prose, plain label, explicit ABSTAIN, empty, timeout, or provider error. No replacement model call is permitted in this phase.

The available evidence does establish that all 22 failed **primary** multi-candidate evaluations reached the parser as `invalid`; valid input was confirmed for every candidate list (each has two or three non-empty candidate records). It does not identify the raw shape responsible for any individual invalid result.

An offline parser-contract audit, using only static sample strings, produced the following behavior:

| Raw response shape | Parser outcome | Interpretation |
| --- | --- | --- |
| Exact `{"selection":"A"}` | `selected` | Accepted. |
| JSON with leading whitespace | `invalid` | Valid JSON document rejected by `raw.trim() !== raw`. |
| JSON with trailing newline | `invalid` | Valid JSON document rejected by `raw.trim() !== raw`. |
| Fenced JSON | `invalid` | Model contract violation. |
| JSON followed by prose | `invalid` | Model contract violation. |
| Plain `A` | `invalid` | Model contract violation. |
| Exact `{"selection":"ABSTAIN"}` | `abstained` | Explicit abstention is distinguishable from invalid output. |
| Empty string | `invalid` | Empty output is folded into the invalid bucket. |

Thus surrounding JSON whitespace is a generic parser/serialization compatibility issue, while JSON plus prose is a separate model-output contract violation. The preserved first report has no raw text, so no count may be attributed to either shape.

## Public-24, public-30, and public-49

All three cases are multi-candidate cases. Their original-order primary outcome is inferred as `invalid` from the aggregate arithmetic above: every primary multi-candidate evaluation failed as invalid, while all 28 selected/correct results are the 28 direct single-candidate cases. Raw response text and shape are unavailable. Reversed-order per-case outcomes are not stored; the aggregate only proves they did not induce a wrong selection.

| Case | Original candidate order | Reversed candidate order | Original raw category | Original parsed result / mapped ID | Gold ID | Reversed raw category / parsed result / mapped ID |
| --- | --- | --- | --- | --- | --- |
| `public-24` | `PB-MT-UNCONSUMED-REFUND`, `PB-MT-AFTERSALES-CONTACT`, `PB-MT-REFUND-ORIGINAL-PAYMENT` | `PB-MT-REFUND-ORIGINAL-PAYMENT`, `PB-MT-AFTERSALES-CONTACT`, `PB-MT-UNCONSUMED-REFUND` | Not retained | `ABSTAIN` / `invalid` / none | `PB-MT-REFUND-ORIGINAL-PAYMENT` | Not retained; not individually recoverable |
| `public-30` | `PB-MT-VOUCHER-USE`, `PB-MT-UNCONSUMED-REFUND` | `PB-MT-UNCONSUMED-REFUND`, `PB-MT-VOUCHER-USE` | Not retained | `ABSTAIN` / `invalid` / none | `PB-MT-UNCONSUMED-REFUND` | Not retained; not individually recoverable |
| `public-49` | `PB-MT-FULFILLMENT-ALTERNATIVE`, `PB-MT-CHANGE-REFUND` | `PB-MT-CHANGE-REFUND`, `PB-MT-FULFILLMENT-ALTERNATIVE` | Not retained | `ABSTAIN` / `invalid` / none | `PB-MT-FULFILLMENT-ALTERNATIVE` | Not retained; not individually recoverable |

## Gate interpretation

This first run has no observed wrong relevance selection: 28 direct single-candidate selections are correct and the failed primary multi-candidate results are parser-invalid rather than explicit semantic abstentions or wrong evidence choices. The result does not prove that `gpt-5.6-sol` cannot perform semantic relevance selection; it proves that the current one-shot structured-output boundary did not obtain parser-acceptable output for the primary multi-candidate cases.

The missing raw-response trace prevents a more granular allocation between whitespace-only JSON, empty output, fenced JSON, prose, and other invalid shapes. That is an observability limitation of this frozen evaluator, not evidence permitting a behavior change in this phase.

### B — SELECTOR_IO_CONTRACT_LIMITATION
