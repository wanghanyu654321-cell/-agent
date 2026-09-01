# V2.1 Retrieval Evaluation Specification

`src/retrieval-eval.ts` evaluates a supplied `RetrievalService` and gold-labelled `RetrievalEvalCase` records. Each case contains a query, tenant/store context, answerability, expected evidence IDs, query provenance, category, difficulty, and optional scope expectation.

The evaluator measures Top-1 Hit Rate, Recall@3, No-Answer Correct Rejection Rate, wrong-evidence rate, cross-tenant leakage, cross-store leakage, unauthorized knowledge exposure, provenance breakdown, and category breakdown. It does not use an LLM judge.

Gold labels must be traceable to the factual-authority mapping. `PUBLIC_REAL_CASE`, `HUMAN_AUTHORED`, and `SYNTHETIC_QUERY` remain distinct. `PUBLIC_REAL_CASE` supplies only de-identified scenario wording; it is never factual authority. `SYNTHETIC_QUERY` is controlled augmentation only. The public benchmark has 62 cases and includes a real-runtime grounding and audit evaluation, so it is stronger than the earlier four-case public plumbing regression while remaining bounded to public local-services knowledge.
