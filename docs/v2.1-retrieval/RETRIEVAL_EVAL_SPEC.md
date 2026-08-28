# V2.1 Retrieval Evaluation Specification

`src/retrieval-eval.ts` evaluates a supplied `RetrievalService` and gold-labelled `RetrievalEvalCase` records. Each case contains a query, tenant/store context, answerability, expected evidence IDs, query provenance, category, difficulty, and optional scope expectation.

The evaluator measures Top-1 Hit Rate, Recall@3, No-Answer Correct Rejection Rate, wrong-evidence rate, cross-tenant leakage, cross-store leakage, unauthorized knowledge exposure, provenance breakdown, and category breakdown. It does not use an LLM judge.

Gold labels for a real pilot must be traceable to the authoritative source mapping. `REAL_QUERY`, `HUMAN_AUTHORED`, and `SYNTHETIC_QUERY` remain distinct; no synthetic query is described as a real customer query. The public regression is deliberately opaque and synthetic, so it validates evaluator/CI plumbing only and does not substitute for the required 60 real-quality queries or real-runtime grounding evaluation.
