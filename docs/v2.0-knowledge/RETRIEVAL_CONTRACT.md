# V2.0 Retrieval Contract

`RetrievalService` remains the product boundary. V2.0 adds `RetrievalContext` (`tenantId`, `storeId`) and governed metadata to `RetrievalEvidence`; it does not add an Agent loop, vector database, provider router, or Pi fork.

`GovernedKnowledgeRetrievalService` performs deterministic token matching over validated structured entries. It filters by status and scope before returning evidence, preserves the stable entry ID and metadata, and throws when its `AbortSignal` is already aborted. This keeps the existing per-tool and overall cancellation paths effective.

The runtime independently calls `isAdmissibleKnowledgeEvidence()` after retrieval. Therefore a non-empty result alone cannot set `verifiedKnowledgeEvidence`. A factual general answer is emitted from the admitted evidence text rather than the provider completion; no evidence, invalid metadata, unapproved status, synthetic production data, retired data, or a scope mismatch produces the existing fail-closed fallback.

Safety retrieval remains under the V1 specialized `ApprovedSafetyRetrievalService` and its stricter decision/output rules. V2.0 does not weaken or re-model that path.
