# V2.3 Selector I/O Contract Hardening Report

## Scope and preservation

This checkpoint implements only generic selector I/O compatibility and sanitized per-invocation observability. The semantic prompt and prompt version `v2.3.0`, provider `openai-codex`, model `gpt-5.6-sol`, retrieval, corpus, benchmark, gold labels, and Gate thresholds remain unchanged. No `SupportAgentRuntime` integration and no V2.3 release tag were created.

The immutable FIRST report remains `evals/selection/semantic/reports/first-real-run.json` with SHA-256 `F487652C1EBB50EAC55A77B69660D2B2A85F3B5EFDFBF892C05F45D1F25D6EC3`.

## Generic contract change

The parser now accepts a JSON document with leading/trailing JSON whitespace, then still requires exactly one `selection` field and a label allowed by the current candidate set. It rejects empty output, plain labels, Markdown fences, JSON plus prose, extra fields, malformed JSON, unknown labels, and labels outside the current candidate set. No extraction from free text or fences is performed.

For each semantic call, the persisted trace contains candidate mapping, order, outcome, expected/mapped evidence, correctness classification, and only raw-output shape, SHA-256, and length. It does not persist raw model output, credentials, auth paths, headers, or hidden reasoning.

## I/O-contract real run

Report: `evals/selection/semantic/reports/io-contract-run.json`
Provider/model: `openai-codex` / `gpt-5.6-sol`
Prompt version: `v2.3.0`
Benchmark hash: `af35c7c5467fc4d293626044e4a42edc18e068c07ffb95010192bb6b21651137`
Corpus hash: `1aecf6ea0270ad48ce111737c6b6acb57a59006ff69f59257cb1c0f7f3e723af`

| Evidence | Result |
| --- | --- |
| Semantic calls | 44 |
| Primary outcomes | 0 selected, 0 abstained, 22 invalid, 0 timeout, 0 provider error |
| Reversed outcomes | 0 selected, 0 abstained, 22 invalid, 0 timeout, 0 provider error |
| Raw output shapes | 44 `empty`; all other categories 0 |
| Trace classifications | 0 correct, 0 wrong, 44 non-selection |
| Correct selection rate | 56% (28 one-candidate direct selections of 50 cases) |
| Wrong selection rate | 0% |
| Answerable coverage | 56% |
| Selected evidence precision | 100% |
| Multi-candidate accuracy | 0% |
| Multi-candidate wrong selection rate | 0% |
| Order-induced wrong selection rate | 0% |
| Invalid selector output rate | 100% |

`public-24`, `public-30`, and `public-49` each produced `empty`/`invalid` in both primary and reversed invocations; none had a semantic selection.

## Decision

**GATE NOT PASSED.** The generic whitespace compatibility fix did not remove invalid outputs: the observed response shape is empty, not whitespace-wrapped JSON. Per the V2.3 contract, this checkpoint stops here. It does not tune the prompt, change the provider/model, alter retrieval or data, introduce case-specific handling, or start runtime integration.
