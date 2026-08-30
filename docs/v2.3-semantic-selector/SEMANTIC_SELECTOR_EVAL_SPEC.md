# V2.3 Semantic Selector Evaluation Spec

The real-model command is `npm run eval:selection:semantic`. It requires `SEMANTIC_SELECTOR_PROVIDER`, `SEMANTIC_SELECTOR_MODEL`, and that provider's ambient Pi-compatible credential. It evaluates the frozen 50 answerable public cases: one candidate selects directly; 2-3 candidates receive exactly one semantic call in original and reversed order.

The Gate requires correct selection >=98%, wrong selection 0%, coverage >=95%, selected precision >=98%, invalid output 0%, multi-candidate wrong selection 0%, and order-induced wrong selection 0%. The FIRST real invocation is immutable at `evals/selection/semantic/reports/first-real-run.json`. This I/O-contract run writes once to `evals/selection/semantic/reports/io-contract-run.json`; the command refuses to overwrite either report.

Each multi-candidate invocation records a sanitized trace: case ID, primary/reversed order, candidate label-to-evidence mapping, outcome, valid selection mapping where present, expected evidence ID, classification, and raw-output shape/SHA-256/length. It never records raw model output, credentials, auth paths, headers, or hidden reasoning. `traceSummary` reports outcome counts by order, raw-output-shape counts, and correct/wrong/non-selection totals directly from those traces.
