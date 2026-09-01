# Real Model Evaluation Blocker

Checked on 2026-08-29: no supported provider credential environment variable or selector provider/model configuration is available in this execution environment. `npm run eval:selection:semantic` therefore exits with `REAL_MODEL_EVAL_BLOCKED` before any model call.

Required external configuration: `SEMANTIC_SELECTOR_PROVIDER`, `SEMANTIC_SELECTOR_MODEL`, and the selected Pi provider's credential. No secret value is requested for commit or documentation. Until a real one-shot Pi model call produces the committed FIRST report, fake-provider tests cannot establish semantic-selection quality and runtime integration is prohibited.
