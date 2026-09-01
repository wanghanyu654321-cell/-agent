# V2.3 Real Model Selection Report

The frozen FIRST invocation is stored at `evals/selection/semantic/reports/first-real-run.json`; its SHA-256 remains `F487652C1EBB50EAC55A77B69660D2B2A85F3B5EFDFBF892C05F45D1F25D6EC3`.

The distinct I/O-contract invocation used `openai-codex` / `gpt-5.6-sol` with unchanged prompt version `v2.3.0`, benchmark hash `af35c7c5467fc4d293626044e4a42edc18e068c07ffb95010192bb6b21651137`, and corpus hash `1aecf6ea0270ad48ce111737c6b6acb57a59006ff69f59257cb1c0f7f3e723af`. Its complete sanitized report is `evals/selection/semantic/reports/io-contract-run.json`.

Result: **GATE NOT PASSED.** All 44 semantic invocations were `invalid` with raw-output shape `empty`: 22 primary and 22 reversed. There were no explicit `ABSTAIN`, timeout, provider-error, or wrong-selection outcomes. The generic whitespace parser fix therefore did not validate the Gate and no prompt, provider, model, retrieval, corpus, benchmark, gold label, or threshold was changed.

See [IO_CONTRACT_HARDENING_REPORT.md](IO_CONTRACT_HARDENING_REPORT.md) for the exact metrics and preservation boundary.
