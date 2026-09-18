# Final Unseen Holdout V2.3.1 Contract Audit

## Audit boundary

This is a pre-exposure human contract audit. It reads the official positive propositions and separately reasons about what they do and do not establish. It does not alter candidate text with evaluator-authored absence claims. No model, embedding, or external semantic judge was used.

| Case | Group | User asks | Candidate fact(s) | Contract verdict |
| --- | --- | --- | --- | --- |
| `final-v2.3.1-01` | A | Classification of discount/benefit-for-review conduct | The selected rule expressly classifies benefit exchange for evaluation. | `VALID_SELECT`: the conduct and classification match directly. |
| `final-v2.3.1-02` | A | Classification of validating through another store and mis-associating the review | The selected rule expressly lists other-store verification and a wrong-store review association. | `VALID_SELECT`: the factual pattern is direct. |
| `final-v2.3.1-03` | A | Classification of forged materials intended to influence penalty review | The selected rule expressly lists forged appeal material and false information intended to interfere with review. | `VALID_SELECT`: direct conduct classification. |
| `final-v2.3.1-04` | A | Duration of ranking demotion at nine integrity points | The cumulative-point table expressly gives ninety days. | `VALID_SELECT`: exact threshold, sanction, and duration. |
| `final-v2.3.1-05` | B | Minimum number of days an activity must run | One candidate requires showing an activity period; the other gives a price-appeal deadline. | `VALID_ABSTAIN`: neither establishes a minimum activity length. |
| `final-v2.3.1-06` | B | Font size for voucher-condition display | Candidates require disclosure of conditions and activity period. | `VALID_ABSTAIN`: no candidate establishes a display-font value. |
| `final-v2.3.1-07` | B | Required file format for price-appeal evidence | Candidates give appeal entry/deadline and review outcome. | `VALID_ABSTAIN`: no candidate establishes a file format. |
| `final-v2.3.1-08` | B | Character limit of a seller’s review reply | Candidates give reply/append windows and modification count. | `VALID_ABSTAIN`: no candidate establishes a reply-length limit. |
| `final-v2.3.1-09` | C | Calendar date that content distribution resumes after a benefit-exchange penalty | Candidates describe the conduct and a ninety-day duration at a specified cumulative score. | `VALID_ABSTAIN`: the case needs an incident-specific start date to yield a calendar date. |
| `final-v2.3.1-10` | C | Required job role that submits a seller reply | Candidates describe seller reply ability and buyer deletion effects. | `VALID_ABSTAIN`: no candidate establishes a required personnel role. |
| `final-v2.3.1-11` | C | Required delivery channel for a price-appeal ruling | Candidates describe filing and review, not ruling delivery. | `VALID_ABSTAIN`: the requested communication channel is not established. |
| `final-v2.3.1-12` | C | Exact duration of ranking demotion for severe false trade | Candidates list severe false-trade actions and a different evaluation-integrity duration. | `VALID_ABSTAIN`: neither establishes the requested sanction duration for this violation class. |

## Boundary conclusion

Group B isolates a missing finer-grained fact while retaining one related positive rule. Group C makes the candidate relationship materially closer: each has two workflow-adjacent candidates but no direct answer. The four Group-A cases are positive controls where one exact official proposition does answer the actual question. This distinction is the frozen contract; the validator only checks data shape and isolation, not the semantic conclusion.
