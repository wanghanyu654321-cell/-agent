# V2.3 Semantic Selector Decision

The code-side contract and deterministic regressions are complete. OpenAI Codex OAuth/configuration became available and a FIRST real run was attempted, but its extracted empty text was not a valid semantic-quality observation. Pi envelope diagnostics show failed `AssistantMessage` envelopes (`stopReason: "error"`, no content), and the adapter now maps those to typed `provider_error` rather than `invalid`.

The latest one-call provider-error control also returned a fast failed envelope. Its sanitized category is `unknown`; no raw provider error is retained. Therefore **SEMANTIC CAPABILITY NOT YET VALIDLY EVALUATED**. This is not a semantic-quality failure and does not justify a vector database, embeddings, a second Agent, or an LLM judge. See [PROVIDER_ERROR_CLASSIFICATION.md](PROVIDER_ERROR_CLASSIFICATION.md) for the controlling evidence.
