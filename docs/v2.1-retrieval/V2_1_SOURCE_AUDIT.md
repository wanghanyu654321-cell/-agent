# V2.1 Real Knowledge & Retrieval Source Audit

## Frozen input

- Working branch: `feat/v2.1-real-knowledge-retrieval`.
- V2.1 starts from `customer-support-agent-v2.0.1-faq-admission^{}` = `f8a5498ddae424246a9e32fcc430d186573d9d55`.
- V2.0 remains `98cca9b92c13c2639beb958177923b3c09b42ed9`; V0 through V2.0.1 peeled tags were verified before modification.
- Pi dependencies in `package.json` and the lockfile root remain exactly `0.84.3`.

## Baseline read and boundaries

The V2.0.1 runtime, knowledge contract, Safety boundary, FAQ admission tests, governed grounding tests, governed knowledge tests, knowledge evaluation, workflow, integrity script, `knowledge/README.md`, V2.0/V2.0.1 documentation, package manifest, and lockfile were read before production changes.

`SupportAgentRuntime` remains the only runtime and Pi Agent owner. `GovernedKnowledgeRetrievalService` remains the retrieval implementation behind `RetrievalService`; no vector database, embedding service, second Agent runtime, Pi fork, or vendor copy is present.

## V2.1 public benchmark decision

The original private-source absence remains documented in `REAL_SOURCE_BLOCKER.md` as historical evidence. On 2026-08-29 the product scope was explicitly narrowed to a public official local-services benchmark. The new corpus contains only reviewed atomic benchmark facts from public official sources; public real-case material is query wording only and synthetic queries are augmentation only.

V2.1 adds a bounded deterministic lexical normalization/ranking path beneath the existing `RetrievalService`, a 62-case benchmark, and runtime/audit verification. It does not add a vector database, embeddings, reranking, LLM judging, a second runtime, Pi source, or store-specific business facts.
