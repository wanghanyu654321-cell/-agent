# V2.2 Candidate Score and Ambiguity Analysis

## Method

This analysis runs the unchanged V2.1 lexical candidate retriever after V2.2 exposes its already-computed deterministic `score` and `rank`. It covers all 50 answerable public benchmark cases. Candidate lists below are ordered by rank and use `ID@score`; `—` means no rank-two candidate. No corpus, query, label, score formula, or ordering was changed.

| Case | Expected gold | Candidates in rank order | Top-1 | Top-2 | Margin | Top-1 gold |
| --- | --- | --- | ---: | ---: | ---: | --- |
| public-01 | PB-MT-VOUCHER-USE | PB-MT-VOUCHER-USE@93; PB-MT-EXPIRED-AUTO-REFUND@20 | 93 | 20 | 73 | yes |
| public-02 | PB-MT-VOUCHER-USE | PB-MT-VOUCHER-USE@60; PB-MT-EXPIRED-AUTO-REFUND@42; PB-MT-UNCONSUMED-REFUND@20 | 60 | 42 | 18 | yes |
| public-03 | PB-MT-VOUCHER-USE | PB-MT-VOUCHER-USE@47; PB-MT-FULFILLMENT-RESERVATION@25 | 47 | 25 | 22 | yes |
| public-04 | PB-MT-VOUCHER-USE | PB-MT-VOUCHER-USE@66; PB-MT-EXPIRED-AUTO-REFUND@25 | 66 | 25 | 41 | yes |
| public-05 | PB-MT-VOUCHER-USE | PB-MT-VOUCHER-USE@97; PB-MT-UNCONSUMED-REFUND@20 | 97 | 20 | 77 | yes |
| public-06 | PB-MT-CHANGE-REFUND | PB-MT-CHANGE-REFUND@141 | 141 | — | 141 | yes |
| public-07 | PB-MT-CHANGE-REFUND | PB-MT-CHANGE-REFUND@60 | 60 | — | 60 | yes |
| public-08 | PB-MT-CHANGE-REFUND | PB-MT-CHANGE-REFUND@114 | 114 | — | 114 | yes |
| public-09 | PB-MT-CHANGE-REFUND | PB-MT-CHANGE-REFUND@72 | 72 | — | 72 | yes |
| public-10 | PB-MT-CHANGE-REFUND | PB-MT-CHANGE-REFUND@79; PB-MT-MERCHANT-CANNOT-FULFILL@47; PB-MT-AFTERSALES-CONTACT@20 | 79 | 47 | 32 | yes |
| public-11 | PB-MT-MERCHANT-CANNOT-FULFILL | PB-MT-MERCHANT-CANNOT-FULFILL@103; PB-MT-FULFILLMENT-ALTERNATIVE@25; PB-MT-FULFILLMENT-RESERVATION@25 | 103 | 25 | 78 | yes |
| public-12 | PB-MT-MERCHANT-CANNOT-FULFILL | PB-MT-MERCHANT-CANNOT-FULFILL@44; PB-MT-FULFILLMENT-CLOSURE@20 | 44 | 20 | 24 | yes |
| public-13 | PB-MT-MERCHANT-CANNOT-FULFILL | PB-MT-MERCHANT-CANNOT-FULFILL@73 | 73 | — | 73 | yes |
| public-14 | PB-MT-MERCHANT-CANNOT-FULFILL | PB-MT-MERCHANT-CANNOT-FULFILL@43 | 43 | — | 43 | yes |
| public-15 | PB-MT-MERCHANT-CANNOT-FULFILL | PB-MT-MERCHANT-CANNOT-FULFILL@47; PB-MT-FULFILLMENT-ALTERNATIVE@20 | 47 | 20 | 27 | yes |
| public-16 | PB-MT-AFTERSALES-CONTACT | PB-MT-AFTERSALES-CONTACT@82; PB-MT-UNCONSUMED-REFUND@44; PB-DP-HELP-UNVERIFIED@20 | 82 | 44 | 38 | yes |
| public-17 | PB-MT-AFTERSALES-CONTACT | PB-MT-AFTERSALES-CONTACT@71 | 71 | — | 71 | yes |
| public-18 | PB-MT-AFTERSALES-CONTACT | PB-MT-AFTERSALES-CONTACT@43; PB-MT-EXPIRED-AUTO-REFUND@25; PB-MT-UNCONSUMED-REFUND@25 | 43 | 25 | 18 | yes |
| public-19 | PB-MT-AFTERSALES-CONTACT | PB-MT-AFTERSALES-CONTACT@65 | 65 | — | 65 | yes |
| public-20 | PB-MT-AFTERSALES-CONTACT | PB-MT-AFTERSALES-CONTACT@54 | 54 | — | 54 | yes |
| public-21 | PB-MT-REFUND-ORIGINAL-PAYMENT | PB-MT-REFUND-ORIGINAL-PAYMENT@44 | 44 | — | 44 | yes |
| public-22 | PB-MT-REFUND-ORIGINAL-PAYMENT | PB-MT-REFUND-ORIGINAL-PAYMENT@78 | 78 | — | 78 | yes |
| public-23 | PB-MT-REFUND-ORIGINAL-PAYMENT | PB-MT-REFUND-ORIGINAL-PAYMENT@60 | 60 | — | 60 | yes |
| public-24 | PB-MT-REFUND-ORIGINAL-PAYMENT | PB-MT-UNCONSUMED-REFUND@49; PB-MT-AFTERSALES-CONTACT@39; PB-MT-REFUND-ORIGINAL-PAYMENT@38 | 49 | 39 | 10 | **no** |
| public-25 | PB-MT-REFUND-ORIGINAL-PAYMENT | PB-MT-REFUND-ORIGINAL-PAYMENT@44 | 44 | — | 44 | yes |
| public-26 | PB-MT-UNCONSUMED-REFUND | PB-MT-UNCONSUMED-REFUND@82; PB-MT-AFTERSALES-CONTACT@49; PB-MT-EXPIRED-AUTO-REFUND@48 | 82 | 49 | 33 | yes |
| public-27 | PB-MT-UNCONSUMED-REFUND | PB-MT-UNCONSUMED-REFUND@54; PB-MT-EXPIRED-AUTO-REFUND@20 | 54 | 20 | 34 | yes |
| public-28 | PB-MT-UNCONSUMED-REFUND | PB-MT-UNCONSUMED-REFUND@53; PB-MT-EXPIRED-AUTO-REFUND@38; PB-DP-HELP-UNVERIFIED@20 | 53 | 38 | 15 | yes |
| public-29 | PB-MT-UNCONSUMED-REFUND | PB-MT-UNCONSUMED-REFUND@44 | 44 | — | 44 | yes |
| public-30 | PB-MT-UNCONSUMED-REFUND | PB-MT-VOUCHER-USE@60; PB-MT-UNCONSUMED-REFUND@48 | 60 | 48 | 12 | **no** |
| public-31 | PB-MT-EXPIRED-AUTO-REFUND | PB-MT-EXPIRED-AUTO-REFUND@76; PB-MT-VOUCHER-USE@60; PB-MT-UNCONSUMED-REFUND@30 | 76 | 60 | 16 | yes |
| public-32 | PB-MT-EXPIRED-AUTO-REFUND | PB-MT-EXPIRED-AUTO-REFUND@67; PB-MT-UNCONSUMED-REFUND@20 | 67 | 20 | 47 | yes |
| public-33 | PB-MT-EXPIRED-AUTO-REFUND | PB-MT-EXPIRED-AUTO-REFUND@80; PB-MT-UNCONSUMED-REFUND@63 | 80 | 63 | 17 | yes |
| public-34 | PB-MT-EXPIRED-AUTO-REFUND | PB-MT-EXPIRED-AUTO-REFUND@82; PB-MT-UNCONSUMED-REFUND@30 | 82 | 30 | 52 | yes |
| public-35 | PB-MT-EXPIRED-AUTO-REFUND | PB-MT-EXPIRED-AUTO-REFUND@39 | 39 | — | 39 | yes |
| public-36 | PB-MT-FULFILLMENT-RESERVATION | PB-MT-FULFILLMENT-RESERVATION@99 | 99 | — | 99 | yes |
| public-37 | PB-MT-FULFILLMENT-RESERVATION | PB-MT-FULFILLMENT-RESERVATION@81 | 81 | — | 81 | yes |
| public-38 | PB-MT-FULFILLMENT-RESERVATION | PB-MT-FULFILLMENT-RESERVATION@52 | 52 | — | 52 | yes |
| public-39 | PB-MT-FULFILLMENT-RESERVATION | PB-MT-FULFILLMENT-RESERVATION@100 | 100 | — | 100 | yes |
| public-40 | PB-MT-FULFILLMENT-RESERVATION | PB-MT-FULFILLMENT-RESERVATION@71 | 71 | — | 71 | yes |
| public-41 | PB-MT-FULFILLMENT-CLOSURE | PB-MT-FULFILLMENT-CLOSURE@105 | 105 | — | 105 | yes |
| public-42 | PB-MT-FULFILLMENT-CLOSURE | PB-MT-FULFILLMENT-CLOSURE@59 | 59 | — | 59 | yes |
| public-43 | PB-MT-FULFILLMENT-CLOSURE | PB-MT-FULFILLMENT-CLOSURE@94 | 94 | — | 94 | yes |
| public-44 | PB-MT-FULFILLMENT-CLOSURE | PB-MT-FULFILLMENT-CLOSURE@81 | 81 | — | 81 | yes |
| public-45 | PB-MT-FULFILLMENT-CLOSURE | PB-MT-FULFILLMENT-CLOSURE@94; PB-MT-FULFILLMENT-ALTERNATIVE@20 | 94 | 20 | 74 | yes |
| public-46 | PB-MT-FULFILLMENT-ALTERNATIVE | PB-MT-FULFILLMENT-ALTERNATIVE@53 | 53 | — | 53 | yes |
| public-47 | PB-MT-FULFILLMENT-ALTERNATIVE | PB-MT-FULFILLMENT-ALTERNATIVE@64 | 64 | — | 64 | yes |
| public-48 | PB-MT-FULFILLMENT-ALTERNATIVE | PB-MT-FULFILLMENT-ALTERNATIVE@44 | 44 | — | 44 | yes |
| public-49 | PB-MT-FULFILLMENT-ALTERNATIVE | PB-MT-FULFILLMENT-ALTERNATIVE@44; PB-MT-CHANGE-REFUND@38 | 44 | 38 | 6 | yes |
| public-50 | PB-MT-FULFILLMENT-ALTERNATIVE | PB-MT-FULFILLMENT-ALTERNATIVE@60 | 60 | — | 60 | yes |

## Distribution findings

- 25 cases have one candidate. Their top candidate is gold in every case.
- Across all 50 answerable cases there are 81 candidate records; the 25 multi-candidate cases account for 56 of them. All 50 cases contain their gold record somewhere in the candidate set, while 22 cases contain at least one non-gold record.
- `public-24` is a wrong Top-1 at score/margin `49/10`; `public-30` is a wrong Top-1 at `60/12`.
- `public-49` is a correct Top-1 at `44/6`. This correct case has a smaller margin than both wrong Top-1 cases.

## Monotonic margin-rule check

The only selection family supported by current score metadata without introducing a new reranker is: select the rank-one candidate if it is the sole candidate or if `top1 - top2 >= threshold`; otherwise abstain. The threshold applies to a numeric confidence margin and contains no benchmark identifier or query condition.

| Margin threshold | Selected cases | Coverage | Correct selections | Correct Selection Rate | Wrong selections | Wrong Selection Rate |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 50 | 100% | 48 | 96% | 2 | 4% |
| 7 | 49 | 98% | 47 | 94% | 2 | 4% |
| 11 | 48 | 96% | 47 | 94% | 1 | 2% |
| 13 | 47 | 94% | 47 | 94% | 0 | 0% |
| 15 | 47 | 94% | 47 | 94% | 0 | 0% |
| 19 | 42 | 84% | 42 | 84% | 0 | 0% |

To reach Correct Selection Rate >= 95%, all 48 correct rank-one cases must be selected, including `public-49` at margin 6. Any monotonic margin threshold low enough to select it also selects both wrong rank-one cases at margins 10 and 12. A threshold high enough to abstain from both wrong cases loses `public-49`, leaving Correct Selection Rate and Coverage at 94%.

No defensible generalized absolute-score, rank, candidate-count, or monotonic margin rule distinguishes these three cases: the only numeric predicates that would do so would be arbitrary score windows constructed after observing their benchmark values. That would violate the anti-gaming rule. A semantic discriminator would be a successor reranker/selector, which V2.2 expressly forbids implementing.
