# V2.0.1 FAQ Admission Contract

## Purpose

FAQ is governed knowledge, not a bypass around governed knowledge. A matching FAQ answer must not enter model context until it has passed the same admission rules used by general knowledge.

## Pre-model admission

For a `search_faq` call, the runtime performs these deterministic steps:

1. Match FAQ questions against the tool query in configured source order.
2. Convert each candidate into evidence carrying `id`, `kind`, `status`, `version`, `sourceRef`, and optional tenant/store scope.
3. Run `isAdmissibleKnowledgeEvidence()` with the request tenant/store and the explicit `allowSyntheticTestKnowledge` flag.
4. Select the first admissible candidate only after that check.
5. Return only the selected candidate text to Pi; then record it through the existing evidence/audit path.

The runtime does not use the model to rank, approve, or repair FAQ candidates.

## Admission outcomes

| Candidate condition | Model-visible tool text | Grounded result |
| --- | --- | --- |
| `approved` and global, tenant-matching, or tenant-and-store-matching | Selected FAQ answer | May be grounded with its trace metadata |
| `synthetic_test_only` with explicit test allowance | Selected fixture text | Test-only grounded result |
| `synthetic_test_only` in production | `No FAQ evidence found.` | Fail closed |
| `unapproved`, `retired`, cross-tenant, or cross-store | `No FAQ evidence found.` when no other candidate qualifies | Fail closed |
| Unauthorized first candidate followed by authorized candidate | Authorized candidate only | Grounded only with authorized evidence |

## Traceability and exposure invariant

When FAQ evidence is admitted, `SupportResult.evidence` and `support-agent.audit.grounding.evidence` retain the actual `{ id, kind, version, sourceRef }`. Rejected candidate content and identifiers do not enter the tool result, verified evidence, result evidence, or audit evidence.

V2.0.1 evaluates rejected and competing FAQ candidates through the real `SupportAgentRuntime`, Pi tool event/session persistence, and audit record. The metric **Unauthorized FAQ Model Exposure Rate** is the fraction of those cases whose persisted Pi session contains the unique rejected candidate text. The required value is `0%`.
