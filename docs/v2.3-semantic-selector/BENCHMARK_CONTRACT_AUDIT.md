# V2.3 Benchmark Contract Audit

## Scope and frozen rubric

This is a deterministic, offline audit of all 50 `expectedAnswerable` cases. No model, embedding, reranker, or Recovery-2 outcome was used before classification. The frozen selector contract is **direct + sufficient**, not nearest topical record.

- **SUPPORTED**: the gold evidence contains the policy or fact needed to answer without a new business-policy fact.
- **PARTIAL**: it addresses the workflow but misses a material component requested by the query.
- **UNSUPPORTED**: the requested fact or action cannot be grounded in the evidence.

The complete frozen case table, including query, provenance, difficulty, directness, sufficiency, reason, unsupported-inference flag, and source/version evidence, is [benchmark-contract-audit.json](../../evals/selection/semantic/reports/benchmark-contract-audit.json).

## Blind classification result

| Classification | Count | Rate |
| --- | ---: | ---: |
| SUPPORTED | 41 | 82% |
| PARTIAL | 9 | 18% |
| UNSUPPORTED | 0 | 0% |

Contract-valid answerable rate is `41 / 50 = 82%`. PARTIAL cases are `public-04`, `public-23`, `public-26`, `public-28`, `public-29`, `public-41`, `public-42`, `public-43`, and `public-44`.

`public-04` is **PARTIAL**: its gold states the consequence after expiry, while the query asks where/how to check validity. `public-28` is **PARTIAL**: its gold gives arrival time after refund approval, while the query asks approval-processing duration. Neither classification uses the model's abstention.

## Recovery-2 diagnostic join

Only after the classifications above were frozen, the immutable 44-trace Recovery-2 report was joined. The 22 multi-candidate cases are:

| Case | Contract | Primary | Reversed | Expected evidence | Result |
| --- | --- | --- | --- | --- | --- |
| public-01 | SUPPORTED | selected | selected | PB-MT-VOUCHER-USE | correct/correct |
| public-02 | SUPPORTED | selected | selected | PB-MT-VOUCHER-USE | correct/correct |
| public-03 | SUPPORTED | selected | selected | PB-MT-VOUCHER-USE | correct/correct |
| public-04 | PARTIAL | abstained | abstained | PB-MT-VOUCHER-USE | non-selection/non-selection |
| public-05 | SUPPORTED | selected | selected | PB-MT-VOUCHER-USE | correct/correct |
| public-10 | SUPPORTED | selected | selected | PB-MT-CHANGE-REFUND | correct/correct |
| public-11 | SUPPORTED | selected | selected | PB-MT-MERCHANT-CANNOT-FULFILL | correct/correct |
| public-12 | SUPPORTED | selected | selected | PB-MT-MERCHANT-CANNOT-FULFILL | correct/correct |
| public-15 | SUPPORTED | selected | selected | PB-MT-MERCHANT-CANNOT-FULFILL | correct/correct |
| public-16 | SUPPORTED | selected | selected | PB-MT-AFTERSALES-CONTACT | correct/correct |
| public-18 | SUPPORTED | selected | selected | PB-MT-AFTERSALES-CONTACT | correct/correct |
| public-24 | SUPPORTED | selected | selected | PB-MT-REFUND-ORIGINAL-PAYMENT | correct/correct |
| public-26 | PARTIAL | selected | selected | PB-MT-UNCONSUMED-REFUND | correct/correct |
| public-27 | SUPPORTED | selected | selected | PB-MT-UNCONSUMED-REFUND | correct/correct |
| public-28 | PARTIAL | abstained | selected | PB-MT-UNCONSUMED-REFUND | non-selection/correct |
| public-30 | SUPPORTED | selected | selected | PB-MT-UNCONSUMED-REFUND | correct/correct |
| public-31 | SUPPORTED | selected | selected | PB-MT-EXPIRED-AUTO-REFUND | correct/correct |
| public-32 | SUPPORTED | selected | selected | PB-MT-EXPIRED-AUTO-REFUND | correct/correct |
| public-33 | SUPPORTED | selected | selected | PB-MT-EXPIRED-AUTO-REFUND | correct/correct |
| public-34 | SUPPORTED | selected | selected | PB-MT-EXPIRED-AUTO-REFUND | correct/correct |
| public-45 | SUPPORTED | selected | selected | PB-MT-FULFILLMENT-CLOSURE | correct/correct |
| public-49 | SUPPORTED | selected | selected | PB-MT-FULFILLMENT-ALTERNATIVE | correct/correct |

On the 38 SUPPORTED multi-candidate traces: correct `38/38`, wrong `0/38`, abstain `0/38`. On the 6 PARTIAL traces: selection `3/6`, abstain `3/6`, wrong-evidence `0/6`. These are diagnostic observations only; they do not recalculate or alter the frozen Recovery-2 Gate.

## Decision

**BENCHMARK CONTRACT PARTIALLY VALID.** Most records support their assigned queries, but nine cases conflate topical relevance or policy-violation context with sufficient grounding for the actual requested fact/action. The frozen Recovery-2 result remains **FAILED** exactly as recorded. It is not enough by itself to adjudicate semantic-selector capability under the authoritative direct-and-sufficient contract. No benchmark change, selector tuning, rerun, runtime integration, or release is authorized by this audit.
