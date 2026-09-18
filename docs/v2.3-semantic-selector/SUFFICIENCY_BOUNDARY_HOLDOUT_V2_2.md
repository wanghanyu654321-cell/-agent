# Sufficiency Boundary Holdout V2.2

## Status

**GATE FAILED WITH COMPLETE DURABLE EVIDENCE.** The one authorized 24-call first-exposure run completed with 7 false selections in true-insufficiency cases (2 primary and 5 reversed). The 4 direct non-uniqueness cases passed in both orders. No retry, tuning, runtime integration, tag, or release is authorized; see [SUFFICIENCY_BOUNDARY_V2_2_GATE_REPORT.md](SUFFICIENCY_BOUNDARY_V2_2_GATE_REPORT.md).

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
