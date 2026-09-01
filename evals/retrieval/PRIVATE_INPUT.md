# Private Retrieval Evaluation Input Boundary

`evals/retrieval/private/` is Git-ignored. It may contain de-identified future gold labels only in a separately governed private evaluation environment. This public V2.1 benchmark uses `PUBLIC_REAL_CASE`, `HUMAN_AUTHORED`, and `SYNTHETIC_QUERY`: the first is scenario wording only, and neither it nor synthetic wording is factual authority. Private inputs must never contain customer names, phone numbers, addresses, orders, membership identifiers, or private staff data.

The public repository contains only evaluator code, controlled non-business fixtures, aggregate metrics, and source-hash manifests. A missing private input is a blocker for the Real Knowledge Gate, not permission to create business facts.
