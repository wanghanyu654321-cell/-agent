# V2.1 Retrieval Failure Analysis

## FIRST-to-FINAL observed gap

The preserved FIRST baseline produced 0% Top-1 Hit Rate and 0% Recall@3 on the 50 answerable public benchmark queries. Its literal all-term match could not tolerate common Chinese wording variations or rank competing policy records.

The smallest generalized repair is deterministic lexical normalization, phrase/tag overlap scoring, and stable relevance sorting, enabled only for this public benchmark retrieval service. It does not add embeddings, vector search, a reranker, LLM judging, a second Agent loop, or new business facts. The default V2.0 retrieval ordering remains unchanged to preserve prior governed-runtime behavior.

## FINAL failure families

The FINAL baseline has one Top-1 miss among 50 answerable queries (96% Top-1) and no Recall@3 miss (100% Recall@3). No-answer rejection, wrong-evidence rate, tenant/store isolation, and unauthorized exposure remain at their gates. The single ranking miss is retained as benchmark evidence rather than patched with a query-specific special case.

Future changes require a new FIRST baseline on a changed corpus and a documented failure family. Do not tune against individual query strings, and do not treat `PUBLIC_REAL_CASE` or `SYNTHETIC_QUERY` wording as factual authority.
