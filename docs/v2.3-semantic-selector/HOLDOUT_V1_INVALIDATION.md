# Holdout V1 pre-run invalidation

## Decision

**HOLDOUT V1 PRE-RUN UNSEEN VALIDITY REJECTED.**

Holdout V1 remains immutable historical evidence at commit `b8af014e094d020689f06275d840191ca9ff9672`. Its exact raw case file and freeze manifest are not changed. It received **0** semantic-selector real-model calls, so it has no semantic result.

The V1 exact old-query collision check was insufficient. Multiple cases are semantic near-clones of the repeatedly reviewed public benchmark and therefore V1 is unsuitable as an unseen semantic-capability Gate. It must never be repaired and reused as unseen.

| Holdout V1 | Old public case | Shared proposition family |
| --- | --- | --- |
| `holdout-25` | `public-28` | approval-duration evidence gap |
| `holdout-10` | `public-47` | replacement value rule |
| `holdout-17` | `public-37` | reservation-result non-recognition |
| `holdout-01` | `public-03` | expiry ends the right to demand service |
| `holdout-19` | `public-09` | rejected merchant change and refund |
| `holdout-28` | `public-42` | current usability during closure |

This is a **benchmark-design failure, not a selector failure**. Audit V3 remains closed at 39 `SUPPORTED`, 11 `PARTIAL`, and 0 `UNSUPPORTED`; the immutable Recovery-2 Gate remains **FAILED**. Runtime integration and release remain unauthorized.
