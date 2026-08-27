# V1 Safety Architecture

`SupportAgentRuntime` remains the sole runtime and Pi Agent-loop owner. `src/safety.ts` supplies product-owned detection, approved-knowledge filtering, and deterministic `supported`/`escalate` dispositions. `search_knowledge` remains the retrieval tool; existing handoff reservations remain the only handoff side-effect path.

`ApprovedSafetyRetrievalService` implements the existing `RetrievalService` interface, receives the existing `AbortSignal`, and returns stable source IDs plus safety metadata. The runtime records observable risk, retrieval, evidence, decision, tool, handoff, and guard data in the existing `support-agent.audit` custom entry. It does not persist hidden reasoning or create another session/audit framework.
