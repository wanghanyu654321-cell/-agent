# Unseen Semantic Holdout V2

## Status

**UNSEEN SEMANTIC HOLDOUT V2 FROZEN.** **REAL-MODEL HOLDOUT V2 GATE NOT YET EXECUTED.** This freeze made zero provider calls and does not authorize runtime integration, a release tag, or any selector change.

V2 replaces V1 only as the future unseen-capability Gate. V1 remains immutable historical evidence but its pre-run unseen validity is rejected because semantic near-clones escaped its exact-string collision check.

## Holdout-only evidence boundary

The 12-record evidence pack is sourced from first-party Meituan Rules Center pages and is evaluation-only. Every record has `allowedForHoldoutOnly: true` and `runtimeAdmission: false`; it is neither production knowledge nor public-benchmark knowledge and is not reachable through `SupportAgentRuntime`.

Its proposition families are appointment inventory/review/change handling, scheduled-arrival priority, merchant contactability, channel equality, unauthorized batch return, undisclosed charges/conditions, fee disclosure, valid vouchers after cooperation termination, and seller appointment-contact obligations. The pack deliberately excludes the old public benchmark's expiry, refund, consumed after-sales, reservation refusal, closure notice, and alternative-service propositions.

## Frozen evaluation contract

- 24 primary cases: 18 direct+sufficient positive selections and 6 hard `ABSTAIN` cases.
- 24 deterministic reversed-order diagnostics: 48 future calls total.
- Every raw case stores `goldDirectness`, `goldSufficiency`, and `requiresUnsupportedInference`; the validator only verifies them and never derives them from `expectedSelection`.
- Each positive has exactly one direct+sufficient candidate; each ABSTAIN case has only plausible but insufficient candidates.

The manifest pins the exact evidence and case bytes, `v2.3.0` prompt hash, and integer-only pass requirements. A future authorized run must meet all of them without changing the frozen inputs.
