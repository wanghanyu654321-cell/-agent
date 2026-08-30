# Holdout V2 proposition-level novelty audit

This is a manual, deterministic proposition audit; no embedding, selector, or LLM judge was used. Each final V2 case is `NEW` because its requested proposition differs materially from the closest reviewed public/V1 family.

| Case | New proposition | Closest public / V1 | Why not equivalent | Verdict |
| --- | --- | --- | --- | --- |
| `holdout-v2-01` | online inventory matches capacity | `public-36` / `holdout-08` | upstream inventory truth, not post-booking refusal | NEW |
| `holdout-v2-02` | do not overstate online capacity | `public-36` / `holdout-08` | preventive inventory constraint, not rejection classification | NEW |
| `holdout-v2-03` | overdue old-system review auto-rejects | `public-36` / `holdout-08` | system-review outcome was never tested | NEW |
| `holdout-v2-04` | assist user-requested cancellation | `public-36` / `holdout-26` | voluntary cancellation cooperation, not remedy after refusal | NEW |
| `holdout-v2-05` | assist user-requested rescheduling | `public-36` / `holdout-26` | rescheduling cooperation is a separate user intent | NEW |
| `holdout-v2-06` | prioritize scheduled arrivals | `public-38` / `holdout-20` | priority after arrival, not whether refusal is non-reception | NEW |
| `holdout-v2-07` | invalid contact details are non-reception | `public-no-answer-5` / none | contactability obligation, not a request for a phone number | NEW |
| `holdout-v2-08` | equal product quantity across channels | `public-47` / `holdout-10` | channel discrimination, not substitute value | NEW |
| `holdout-v2-09` | equal service attitude across channels | `public-47` / `holdout-10` | service treatment, not replacement goods | NEW |
| `holdout-v2-10` | unauthorized batch return of usable order | `public-26` / none | unilateral batch-return operation, not refund application | NEW |
| `holdout-v2-11` | undisclosed holiday surcharge | none / none | price-condition disclosure was not tested | NEW |
| `holdout-v2-12` | undisclosed raw-material surcharge | none / none | a different explicitly listed surcharge trigger | NEW |
| `holdout-v2-13` | undisclosed minimum spend | none / none | consumption threshold, not price refund or service substitution | NEW |
| `holdout-v2-14` | undisclosed forced bundle | none / none | bundling condition, not substitute-service choice | NEW |
| `holdout-v2-15` | fee notice before payment | none / none | general pre-payment disclosure duty | NEW |
| `holdout-v2-16` | fee consent and no unreasonable inducement | none / none | consent standard, not pre-payment notice wording | NEW |
| `holdout-v2-17` | valid voucher after merchant cooperation ends | `public-03` / `holdout-01` | valid voucher after termination, not expired voucher use | NEW |
| `holdout-v2-18` | no refusal when buyer cannot contact seller | `public-37` / `holdout-17` | contact-caused travel barrier has an explicit fulfillment rule | NEW |
| `holdout-v2-19` | unknown review timeout | `public-28` / `holdout-25` | booking-review duration, not refund-approval duration | NEW |
| `holdout-v2-20` | unknown contactability compensation amount | `public-no-answer-9` / none | new contactability fact with no amount rule | NEW |
| `holdout-v2-21` | unknown surcharge-refund timing | `public-30` / `holdout-06` | surcharge remedy duration, not unconsumed-refund arrival | NEW |
| `holdout-v2-22` | unknown priority lead time | `public-36` / `holdout-08` | priority timing, not refusal classification | NEW |
| `holdout-v2-23` | unspecified post-termination solution | `public-03` / `holdout-01` | valid-voucher termination remedy, not expiry/refund | NEW |
| `holdout-v2-24` | unknown reschedule-response deadline | `holdout-26` / `public-36` | voluntary reschedule timing, not rejected reservation remedy | NEW |

Totals: **24 NEW**, **0 TOO_CLOSE**. The 18 positive cases use any one evidence proposition no more than twice; the six ABSTAIN cases use related evidence only to prove an explicit insufficiency boundary.
