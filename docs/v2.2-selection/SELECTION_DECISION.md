# V2.2 Selection Decision

`SEMANTIC EVIDENCE SELECTION JUSTIFIED`

## Decision

V2.2 does **not** deploy a deterministic evidence selector into the customer runtime and does not create a V2.2 success release tag.

The unchanged candidate retriever meets its frozen Gate: Top-1 is 96% (48/50), Recall@3 is 100%, and every answerable case contains its gold evidence. However, the required selector Gate is stricter: selected precision >= 95%, correct selection >= 95%, coverage >= 95%, and wrong selection = 0%.

`SELECTION_SCORE_ANALYSIS.md` shows that score-only deterministic selection cannot meet all four requirements without an arbitrary, benchmark-derived exception. In particular, the correct `public-49` rank-one score margin is 6, while wrong rank-one margins are 10 (`public-24`) and 12 (`public-30`). Selecting all 48 correct rank-one cases necessarily accepts the two wrong rank-one cases under any monotonic score-margin rule. Abstaining from both wrong cases necessarily drops the correct case at margin 6, reducing both coverage and correct selection to 94%.

Constructing a score window solely to distinguish these benchmark cases would be prohibited benchmark-specific overfitting. Therefore, deterministic score/margin selection cannot simultaneously satisfy `Wrong Selection Rate = 0%`, `Correct Selection Rate >= 95%`, and `Coverage >= 95%` under the current controlled benchmark.

## What this does and does not authorize

Candidate retrieval remains sufficient for the current bounded public pilot. The evidence proves that a future lightweight semantic evidence selector or reranker may be justified for a separately scoped successor phase.

This decision does **not** authorize a vector database, embeddings, a new RAG architecture, LLM judge, second Agent, provider pool, Pi modification, query-specific patch, corpus change, or a V2.2 runtime selector. Safety, FAQ admission, governance, audit behavior, and historical reports remain unchanged.

## Preserved evidence

- V2.2 metadata-only work exposes the pre-existing deterministic score/rank for analysis; it does not alter score calculation, ranking, candidate IDs, or unranked retrieval behavior.
- [`evals/selection/reports/first-run.json`](../../evals/selection/reports/first-run.json) preserves the V2.1.1 all-candidate grounding baseline.
- `public-24` and `public-30` remain unchanged evidence of ambiguous lexical candidates. No fact IDs, query text, or benchmark identifiers are used in code as a selection rule.
