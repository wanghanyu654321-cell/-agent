# Private Retrieval Evaluation Input Boundary

`evals/retrieval/private/` is Git-ignored. It may contain de-identified real-query gold labels only in the private evaluation environment. Evaluation inputs must identify their query provenance as `REAL_QUERY`, `HUMAN_AUTHORED`, or `SYNTHETIC_QUERY` and must not contain customer names, phone numbers, addresses, orders, membership identifiers, or private staff data.

The public repository contains only evaluator code, controlled non-business fixtures, aggregate metrics, and source-hash manifests. A missing private input is a blocker for the Real Knowledge Gate, not permission to create business facts.
