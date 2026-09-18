# Sufficiency Boundary Contract Audit — Holdout V2.2

This is an offline authoring audit. It used no model, embedding, selector, or retrieval runtime. All cited evidence is new, first-party Meituan Rules Center material and is holdout-only (`runtimeAdmission: false`).

| Case | User asks | Candidate facts and conclusion | Direct-answer check | V2.1-23 distinction / verdict |
| --- | --- | --- | --- | --- |
| `boundary-v2.2-01` | Whether there is only one post-departure food-safety channel | Gold says merchant **or** platform customer service; distractor concerns explaining an out-of-authority request | Gold directly answers no; no new fact required | Explicit two-path rule, not an unspecified “reasonable solution” — `VALID_SELECT` |
| `boundary-v2.2-02` | Whether seller appeal is hotline-only | Gold says deduction-record-page appeal **or** hotline; scoring distractor has no appeal path | Gold directly answers no | Explicit parallel appeal paths — `VALID_SELECT` |
| `boundary-v2.2-03` | Whether flight-order feedback is manager-only | Gold says App, hotline, or business manager; accuracy distractor is unrelated | Gold directly answers no | Explicit multiple paths — `VALID_SELECT` |
| `boundary-v2.2-04` | Whether liability compensation has one fixed form | Gold lists transfer, balance, or red packet; food-safety timing distractor is unrelated | Gold directly answers no | Explicit alternatives, not a missing concrete remedy — `VALID_SELECT` |
| `boundary-v2.2-05` | Exact hours to delist after force majeure | Gold says timely delisting; appeal-evidence distractor says evidence must be relevant | Neither candidate contains an hour number | “Timely” cannot be turned into a number; it does not answer non-uniqueness — `VALID_ABSTAIN` |
| `boundary-v2.2-06` | Exact minimum composite score for master store | Gold says composite scoring using operating/evaluation factors; flight-order definition distractor names transaction paths | Neither candidate contains a score or weight | A scoring principle is not a threshold — `VALID_ABSTAIN` |
| `boundary-v2.2-07` | Exact days to correct public information | Gold requires truth, accuracy, completeness, timeliness; compensation-right distractor gives no date | Neither candidate gives days | General timeliness is not an exact deadline — `VALID_ABSTAIN` |
| `boundary-v2.2-08` | Exact hours to finish independently resolvable food-safety complaint | Gold says immediately; compensation-forms distractor names payment forms | Neither candidate gives hours | “Immediately” cannot support a specific hour value — `VALID_ABSTAIN` |
| `boundary-v2.2-09` | Minimum number of appeal documents | Gold requires valid related evidence; food-safety channel distractor names two channels | Neither candidate gives a count | Quality/relevance is not a quantity — `VALID_ABSTAIN` |
| `boundary-v2.2-10` | Exact days to explain an out-of-authority request | Gold requires explanation and may suggest a handling path; appeal-channel distractor names paths | Neither candidate gives days | The question is a deadline, not whether there is one solution — `VALID_ABSTAIN` |
| `boundary-v2.2-11` | Fixed fine amount for flight order | Gold defines flight-order routes; feedback-channel distractor gives contact paths | Neither candidate gives an amount | Definition and feedback do not produce a penalty amount — `VALID_ABSTAIN` |
| `boundary-v2.2-12` | Uniform food-safety compensation formula | Gold confirms compensation may be claimed; force-majeure distractor requires timely delisting | Neither candidate gives a formula | A right to claim compensation is not a formula and does not answer a non-uniqueness meta-question — `VALID_ABSTAIN` |

All 12 cases are `VALID_SELECT` or `VALID_ABSTAIN`; there are no `REJECT_CASE` outcomes.
