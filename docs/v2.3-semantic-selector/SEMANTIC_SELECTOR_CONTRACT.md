# V2.3 Semantic Selector Contract

`SemanticEvidenceSelector.select()` receives only a customer query and 2-3 already admitted records labelled `A`, `B`, and `C`. It receives title/content, never evidence IDs, scope metadata, or gold labels.

It returns one exact JSON object containing only `selection: A|B|C|ABSTAIN`. Malformed JSON, unknown labels, extra fields, empty output, timeout, cancellation and provider error become `ABSTAIN`. The selector has one call, no tools, no session, no memory and no side effects. It cannot generate customer text.

This checkpoint does not integrate the selector into `SupportAgentRuntime`. Safety and FAQ remain unchanged until a real-model offline Gate passes.
