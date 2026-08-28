# V2.0 Governed Knowledge Contract

## Boundary

`knowledge/` is the read-only, product-owned input boundary for general customer-support facts. JSON entries are loaded through `loadKnowledgeEntriesFromDirectory()` and validated before `GovernedKnowledgeRetrievalService` is constructed. The runtime does not scan arbitrary Markdown or accept an arbitrary retrieval text as governed knowledge.

No real production-approved business knowledge is included in this repository. The checked-in fixture is labelled `synthetic_test_only` and is usable only by an explicitly test-configured runtime.

## Required entry fields

Every entry has `id`, `kind`, `status`, `title`, `content`, `version`, `updatedAt`, `sourceRef`, and `tags`. Optional `tenantScope` and `storeScope` narrow use to one tenant or store; a store scope is invalid without a tenant scope. Duplicate IDs, unsupported statuses/kinds, malformed dates, missing text, and invalid scope combinations stop loading.

Allowed kinds are `faq`, `policy`, `sop`, and `reference`. FAQ is not a separate trust path: its status, version, source reference, and scope are passed to the same admission check used by `search_knowledge`.

## Lifecycle and admission

| Status | Production response | Explicit test runtime |
| --- | --- | --- |
| `approved` | May ground a factual response after scope admission | May be used |
| `synthetic_test_only` | Rejected | May be used only when both retrieval and runtime enable test fixtures |
| `unapproved` | Rejected | Rejected |
| `retired` | Rejected | Rejected |

An entry must be globally scoped, tenant-matching, or tenant-and-store-matching. Different-tenant and different-store entries are rejected before they reach the model or set `verifiedKnowledgeEvidence`.

## Traceability

For an admitted result, `SupportResult.evidence` and the persisted `support-agent.audit.grounding.evidence` record the same `{ id, version, sourceRef, kind }` objects. These records are observable evidence metadata only; no hidden model reasoning is stored.
