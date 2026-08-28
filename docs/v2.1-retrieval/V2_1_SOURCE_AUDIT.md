# V2.1 Real Knowledge & Retrieval Source Audit

## Frozen input

- Working branch: `feat/v2.1-real-knowledge-retrieval`.
- V2.1 starts from `customer-support-agent-v2.0.1-faq-admission^{}` = `f8a5498ddae424246a9e32fcc430d186573d9d55`.
- V2.0 remains `98cca9b92c13c2639beb958177923b3c09b42ed9`; V0 through V2.0.1 peeled tags were verified before modification.
- Pi dependencies in `package.json` and the lockfile root remain exactly `0.84.3`.

## Baseline read and boundaries

The V2.0.1 runtime, knowledge contract, Safety boundary, FAQ admission tests, governed grounding tests, governed knowledge tests, knowledge evaluation, workflow, integrity script, `knowledge/README.md`, V2.0/V2.0.1 documentation, package manifest, and lockfile were read before production changes.

`SupportAgentRuntime` remains the only runtime and Pi Agent owner. `GovernedKnowledgeRetrievalService` remains the retrieval implementation behind `RetrievalService`; no vector database, embedding service, second Agent runtime, Pi fork, or vendor copy is present.

## V2.1 code-side decision

The workspace contains no REAL_SOURCE material. V2.1 therefore adds only a Git-ignored private input boundary, an explicit private-corpus loader, a deterministic retrieval-quality evaluator, and a public synthetic regression. It does not add business facts, tune the existing deterministic retrieval algorithm, or claim a real-corpus baseline.
