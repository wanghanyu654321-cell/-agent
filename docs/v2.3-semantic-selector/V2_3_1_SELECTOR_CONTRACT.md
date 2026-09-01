# V2.3.1 Semantic Selector Contract

## Scope

V2.3.1 changes only the one-shot semantic-selector prompt contract. It retains one bounded selector, the existing provider/model architecture, strict one-field JSON output, no chain-of-thought output, and no second model call. It does not integrate into `SupportAgentRuntime`.

| Field | Value |
| --- | --- |
| Prompt version | `v2.3.1` |
| Prompt SHA-256 | `fabf617ce6ecd9cc4f91cd68e42c789f1c0be629297e046a3c782fe6bfe29869` |
| Output schema | exactly `{ "selection": "A" | "B" | "C" | "ABSTAIN" }` |

## Required selection rule

1. A candidate is sufficient only when it supports a truthful, direct answer to the actual query.
2. A candidate may support “the supplied rule does not specify an exact value” only when that absence is explicitly established by candidate content.
3. Silence never establishes absence.
4. Topical relevance alone is insufficient.
5. Candidates are evaluated by their content; labels and ordering are arbitrary and must not affect the outcome.
6. If no single candidate is direct and sufficient, return `ABSTAIN`.
7. The selector uses no outside knowledge and invents no facts.

These rules are prompt-contract requirements only. They are not a claim of real-model quality; no V2.3.1 real-model call is authorized by this checkpoint.
