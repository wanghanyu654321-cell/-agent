# Holdout V2.1 pre-run repair record

## Historical boundary

`evals/selection/semantic/holdout-v2/` is immutable historical pre-run evidence at `1fdb695da16d9a343e65bc5a75839c3938a5fcc3`. It made **zero** real semantic-provider calls. This repair does not represent a selector result or a selector failure.

## Independent review findings

| Issue | Historical V2 finding | V2.1 repair |
| --- | --- | --- |
| A — `holdout-v2-18` | The `HO2-MT-FULFILL-CONTACTABILITY` distractor can materially support the same no-refusal conclusion as gold `HO2-MT-TRANSACTION-RESERVATION-CONTACT`. | Keeps the query and gold, replacing that distractor with `HO2-MT-APPT-ARRIVAL-PRIORITY`, which concerns scheduled-arrival priority rather than refusal because the buyer cannot contact the seller. |
| B — `holdout-v2-11` / `holdout-v2-12` | Both test the same undisclosed-surcharge eligibility proposition with holiday/raw-material trigger variation only. | V2.1 retains the holiday-surcharge case and replaces old `-12` with the first-party premature-verification proposition. |
| C — `holdout-v2-13` / `holdout-v2-14` | Both test the same undisclosed-condition eligibility proposition with minimum-spend/bundling variation only. | V2.1 retains the minimum-spend case and replaces old `-14` with the first-party undisclosed per-use restriction proposition. |

V2.1 also replaces the capacity near-pair at `-02` with a distinct transaction-reservation-information-receipt intent. This is a pre-run diversity repair, not a response to model output.

## Scope

The two added records are first-party Meituan Rules Center evidence and are marked `allowedForHoldoutOnly: true` and `runtimeAdmission: false`. They are evaluation-only and cannot enter the public production corpus or `SupportAgentRuntime`.
