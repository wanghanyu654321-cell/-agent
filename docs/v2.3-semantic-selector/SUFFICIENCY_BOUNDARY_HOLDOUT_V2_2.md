# Sufficiency Boundary Holdout V2.2

## Status

**FROZEN, NOT YET EXPOSED TO A MODEL.** This is an isolated 12-case population designed to distinguish evidence that directly answers “there is not one uniquely mandated option” from evidence that merely omits the exact fact requested.

## Inputs

- 12 new first-party official propositions, all explicitly holdout-only and runtime-rejected.
- 4 `ANSWERABLE_NON_UNIQUENESS` cases and 8 `TRUE_INSUFFICIENCY` cases.
- Each primary has one deterministic reversed candidate order: 24 future calls total.
- Evidence SHA-256: `33cab975a04c66e3bfb357dbc92ff88e39ff131b57bac198983fc93c4c44eda5`.
- Cases SHA-256: `0a65ee1111722e367c7ca5ab4105b89b0a1b0a2b20c0b4537db9ff357c5aa71a`.
- Prompt/version are frozen at `v2.3.0` / `ac4831b003263bf8aea76dd13f535808f84a39306055402ac1f99725707acf4f`.

## Exact future Gate

The Gate requires 4/4 answerable selections and 8/8 insufficiency abstentions in both orders. Across all 24 calls, wrong, invalid, provider-error, timeout, order-induced-wrong, and order-induced-outcome-disagreement counts must all be zero. No threshold can change after exposure.

The population never enters the production corpus or `SupportAgentRuntime`.
