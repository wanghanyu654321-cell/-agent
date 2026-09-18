# V2.2 Evidence Selection Source Audit

## Frozen input verified

- Branch point: `customer-support-agent-v2.1.1-eval-integrity^{}` = `3e379a66a239285798bde7d02e51485b3f50792d`.
- The V2.1.1 annotated tag object is `6e540013efd4a56e2310e66ebe71813442c3fc35`; it peels to the branch point.
- V0 through V2.1.1 historical tags were listed before V2.2 branch creation and remain untouched.
- The root package manifest pins `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, and `@earendil-works/pi-coding-agent` exactly to `0.84.3`.
- The baseline worktree was clean; `npm test` passed 138/138 and `node scripts/verify-integrity.mjs` passed before modification.

## Read paths and observed behavior

- `src/knowledge.ts` performs governed approval/scope admission, calculates deterministic lexical scores for ranked retrieval, sorts them, then discards score and rank while returning up to three evidence records.
- `src/index.ts` owns the one `SupportAgentRuntime`, Pi Agent construction, the four product tools, customer-visible grounding, and persisted `support-agent.audit`. Its current general `search_knowledge` path exposes every candidate to Pi, records every admissible candidate as grounding, and concatenates all admissible content into the answer.
- The same `search_knowledge` tool feeds Safety evidence before `decideSafety()`. V2.2 must keep that raw governed retrieval path intact for Safety and apply selection only to general-business grounding.
- `src/retrieval-eval.ts` defines candidate-retrieval metrics. `evals/retrieval/public-benchmark.ts` provides the 62-case controlled public benchmark and executes runtime cases through Pi tool events and persisted audit data.
- `tests/governed-grounding-runtime.test.ts` establishes approved-only output and evidence/audit tracing. `tests/faq-admission.test.ts` establishes one pre-admitted FAQ before Pi exposure; FAQ is not a V2.2 selection target.
- V2.1 and V2.1.1 documentation records a frozen candidate baseline of Top-1 96% (48/50), Recall@3 100%, candidate precision 61.7284%, candidate extraneous evidence 38.2716%, and all four runtime integrity rates at their Gate values.

## Scope boundary

V2.2 will expose existing deterministic candidate relevance metadata, select zero or one general-business item before Pi exposure, compose successful general-business answers from that selected item only, and record candidate/selected references plus the decision in the existing audit record. It will not alter retrieval score calculation, corpus facts, benchmark labels/order, FAQ admission, Safety evidence input, Pi core, or dependencies. No embeddings, vector database, reranker, LLM judge, second runtime, or new tools are in scope.

## Analysis order

The first implementation step is metadata-only: preserve the existing score and rank on candidate evidence without changing retrieval order. The 62-case candidate distribution will then be recorded in `SELECTION_SCORE_ANALYSIS.md`. Only after that evidence is read will V2.2 select a generalized threshold or abstention rule; no case ID, fact ID, or query text may enter that rule.
