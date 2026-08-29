# V2.3 Semantic Selector Evaluation Spec

The real-model command is `npm run eval:selection:semantic`. It requires `SEMANTIC_SELECTOR_PROVIDER`, `SEMANTIC_SELECTOR_MODEL`, and that provider's ambient Pi-compatible credential. It evaluates the frozen 50 answerable public cases: one candidate selects directly; 2-3 candidates receive exactly one semantic call in original and reversed order.

The Gate requires correct selection >=98%, wrong selection 0%, coverage >=95%, selected precision >=98%, invalid output 0%, multi-candidate wrong selection 0%, and order-induced wrong selection 0%. The first successful real invocation is immutable at `evals/selection/semantic/reports/first-real-run.json`; later runs write `final.json`.
