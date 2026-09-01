# Final Unseen Holdout V2.3.1 Novelty Audit

## Compared populations

The auditor compared every proposition, query, and candidate relationship with the public retrieval benchmark and Holdout V1, V2, V2.1, and V2.2 Boundary. The old populations cover refund/fulfilment/appointment/service-retail rules and earlier evaluation-specific rules. This final population uses previously unused Rules Center pages `191`, `901`, `1449`, and `679`, and newly authored query intents.

| Case IDs | New proposition family | Novelty result | Rationale |
| --- | --- | --- | --- |
| `01`–`04`, `09` | Merchant-review integrity conduct and cumulative-point sanctions | `NEW` | No historic population asks about benefit exchange, wrong-store evaluation association, forged merchant appeal material, or a calendar date derived from a different evaluation sanction. |
| `05`–`07`, `11` | Dine-in price disclosure and price-appeal workflow | `NEW` | The cases concern activity-period disclosure, voucher condition typography, evidence file format, and decision delivery—not historic refund/fulfilment or V2.2 absence-bearing questions. |
| `08`, `10` | Delivery review tools | `NEW` | Reply character limits and required staff roles differ materially from historic customer refund/fulfilment queries and from each other. |
| `12` | Severe false-trade sanctions | `NEW` | It asks for a duration of one severe-false-trade sanction, not a paraphrase of an earlier category or threshold. |

## Candidate-relationship review

No case reuses an old candidate relationship. The closest within-population pairs deliberately differ in the requested factual dimension:

- `05` asks an activity minimum, while `11` asks a ruling-delivery channel; both use price-appeal evidence but test separate missing facts.
- `07` asks evidence format, while `11` asks ruling delivery; filing and review candidates are retained because both questions need the selector to reject workflow relevance that does not answer the exact question.
- `09` needs an incident-specific calendar date, while `12` needs a violation-specific duration; both use sanction candidates but neither is a noun substitution for the other.

Every case has `noveltyVerdict: NEW`; exact historical query collisions are also prevented by the deterministic holdout validator.
