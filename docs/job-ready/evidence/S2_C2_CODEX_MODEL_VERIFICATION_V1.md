# S2 C2 Codex Model-Side Verification V1

**Date:** 2026-09-12

**Source commit:** `a11dfe48d114b7fc58eb53ff81748a2cba0ede19`
**Source tree:** `2b4ca9fabc8f6d5ad08c29ea12f2e706e20885aa`

## Scope and execution boundary

This evidence uses Codex's own model execution allowance.

It does not constitute OpenAI API hosted embedding verification.

No OpenAI API key was used.

No claim is made that the production OpenAIEmbedding provider successfully executed.

One isolated Codex evaluator received only the public synthetic corpus and the cases below. Its visible final decisions were recorded; hidden reasoning was not requested or retained. The session did not expose a model identifier beyond Codex model execution.

```text
Codex model call used: YES
OpenAI API key used: NO
External OpenAI embeddings endpoint called: NO
```

## Synthetic corpus

```text
Title: Public synthetic C2 fixture

Public synthetic C2 evidence fixture.
The marker phrase is cobalt orchid seven.
This text contains no customer or store data.
```

The evaluation used no customer data, store-private data, chat records, PII, or real business corpus.

## Answerability cases

| Case | Admissible evidence | Expected disposition | Actual disposition | Result | Final decision | Brief rationale |
| --- | ---: | --- | --- | --- | --- | --- |
| A — single evidence | 1 | answer eligible | answer eligible | PASS | `cobalt orchid seven` | The sole evidence directly states the marker phrase. |
| B — zero evidence | 0 | fallback | fallback | PASS | fallback | No evidence supports a refund deadline. |
| C — conflicting evidence | 2 | ambiguous then fallback | ambiguous then fallback | PASS | fallback | `cobalt orchid seven` conflicts with `amber willow nine`. |

### Groundedness

Case A substantive answer: `cobalt orchid seven`

```text
unsupported_claims: 0
```

Cases B and C intentionally returned fallback rather than a substantive answer.

## Consistency smoke test

Each variant used only the Case A single evidence item.

| Query | Result | Final answer | Unsupported claims |
| --- | --- | --- | ---: |
| What is the marker phrase? | PASS | `cobalt orchid seven` | 0 |
| Tell me the recorded marker. | PASS | `cobalt orchid seven` | 0 |
| Which phrase appears in the synthetic evidence? | PASS | `cobalt orchid seven` | 0 |

```text
3 query variants: 3/3 PASS
```

## Deterministic regression boundary

The frozen repository runtime was separately exercised without a model-provider call:

```text
npx.cmd vitest --run tests/job-ready-rag/runtime-boundary.test.ts tests/enterprise-private-knowledge.test.ts

Test Files: 2 passed
Tests: 14 passed
```

These tests cover the deterministic answerability route for single evidence, zero evidence, and ambiguous evidence. They do not establish semantic embedding-provider availability.

## Verdict and limitations

```text
C2-CODEX MODEL-SIDE VERIFICATION — PASS

REAL HOSTED OPENAI EMBEDDING:
BLOCKED — VALID API CREDENTIAL UNAVAILABLE
```

This result validates a bounded model-side reasoning and grounding check over public synthetic evidence. It does not verify OpenAI Embeddings API access, a real hosted embedding request, provider authentication, network behavior, embeddings quality, vector relevance, or the historical C2 hosted run.
