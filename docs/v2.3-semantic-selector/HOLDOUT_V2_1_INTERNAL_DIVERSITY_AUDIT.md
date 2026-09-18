# Holdout V2.1 internal diversity audit

This deterministic authoring audit used no selector, embedding, or LLM judge. A pair is redundant only when it asks the same proposition under a changed noun or trigger without a materially different intent or reasoning contract.

| Case | Gold evidence | Query intent | Proposition | Other use of gold | Why distinct / verdict |
| --- | --- | --- | --- | --- | --- |
| `-01` | `HO2-MT-APPT-CAPACITY` | policy condition | online inventory matches actual capacity | none | Single use — PASS |
| `-02` | `HO2-MT-TRANSACTION-RESERVATION-CONTACT` | procedure | seller timely receives reservation information | `-18` | Information-receipt duty, versus no-refusal consequence after failed contact — PASS |
| `-03` | `HO2-MT-APPT-OLD-SYSTEM-REVIEW` | factual status | overdue old-system review auto-rejects | none | Single use — PASS |
| `-04` | `HO2-MT-APPT-USER-CHANGE-COOPERATE` | procedure | assist user-requested cancellation | `-05` | Cancellation workflow, versus rescheduling workflow — PASS |
| `-05` | `HO2-MT-APPT-USER-CHANGE-COOPERATE` | eligibility | assist user-requested rescheduling | `-04` | Rescheduling request, versus cancellation request — PASS |
| `-06` | `HO2-MT-APPT-ARRIVAL-PRIORITY` | policy condition | priority for scheduled arrival | none | Single use — PASS |
| `-07` | `HO2-MT-FULFILL-CONTACTABILITY` | classification | invalid merchant contact is non-reception | none | Single use — PASS |
| `-08` | `HO2-MT-FULFILL-EQUAL-TREATMENT` | classification | lower product quantity across channels | `-09` | Product quantity, versus service attitude — PASS |
| `-09` | `HO2-MT-FULFILL-EQUAL-TREATMENT` | eligibility | poorer service attitude across channels | `-08` | Service attitude, versus product quantity — PASS |
| `-10` | `HO2-MT-FULFILL-BATCH-RETURN` | classification | unauthorized batch return | none | Single use — PASS |
| `-11` | `HO2-MT-FULFILL-UNPUBLISHED-SURCHARGE` | eligibility | undisclosed holiday surcharge | none | Single use — PASS |
| `-12` | `HO21-MT-FULFILL-PREMATURE-VERIFICATION` | eligibility | service-before-completion verification | none | Single use — PASS |
| `-13` | `HO2-MT-FULFILL-UNPUBLISHED-CONDITIONS` | eligibility | undisclosed minimum spend | none | Single use — PASS |
| `-14` | `HO21-MT-FULFILL-UNDISCLOSED-USAGE-LIMIT` | eligibility | undisclosed per-use voucher limit | none | Single use — PASS |
| `-15` | `HO2-MT-MGMT-FEE-DISCLOSURE` | procedure | fee notice before payment | `-16` | Required notice-and-consent procedure, versus prohibition on unreasonable inducement — PASS |
| `-16` | `HO2-MT-MGMT-FEE-DISCLOSURE` | eligibility | no consent / unreasonable inducement | `-15` | Prohibited conduct, versus pre-payment procedure — PASS |
| `-17` | `HO2-MT-MGMT-VALID-COUPON` | eligibility | valid voucher after cooperation termination | none | Single use — PASS |
| `-18` | `HO2-MT-TRANSACTION-RESERVATION-CONTACT` | eligibility | no refusal after failed merchant contact | `-02` | No-refusal consequence, versus timely information-receipt duty — PASS |

**Result: 0 REDUNDANT_PAIR.**
