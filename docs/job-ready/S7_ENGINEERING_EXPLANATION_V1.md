# S7 Engineering Explanation V1

Status: **ONE-PAGE INTERVIEW EXPLANATION — PROBLEM → ARCHITECTURE → VALIDATION → TRADE-OFFS → LIMITS**

Claim boundaries from `docs/job-ready/evidence/S7_JOB_SEARCH_EVIDENCE_PACKAGE_V1.md`
section 6 govern this page. It explains the engineering; it does not enlarge any
claim.

## Problem

A 1–5 person beauty store runs its support/front-desk workflow through a heavy
CRM: staff answer recurring customer questions, record after-sales tickets, and
escalate complaints while fighting the tool instead of the customer. The goal is
to reduce CRM interaction friction for this narrow workflow without rebuilding a
full CRM — an agent that can answer governed questions, create durable tickets,
and hand off to humans, while never inventing business facts.

## Architecture

One request path, no second runtime:

```text
Channel / React (StoreOps, same origin)
    → HTTP / Auth / ExecutionContext (server-derived tenant/store scope)
    → EnterpriseSupportService
    → Pi SupportAgentRuntime (the only Agent loop)
    → Tools / Retrieval / Business Services
    → PostgreSQL (durable business truth)
```

Retrieval subflow (candidate evidence only, never an answer authorization):

```text
Approved knowledge
    → Embedding / Retrieval (FastAPI private service; lexical default, vector explicit)
    → Candidate Evidence
    → Node canonical reconciliation
    → Evidence admission (0 / 1 / 2+ answerability)
    → answer | fallback | escalation
```

The S1 evaluation Harness observes this path from outside; production code never
imports it. pgvector `vector(1536)` extends PostgreSQL for retrieval without
becoming a second authority system.

## Why these boundaries

- **Node owns authority** — identity, tenant/store scope, capabilities, Safety
  precedence, evidence authorization, and durable writes live in one auditable
  place; no request can self-declare trust.
- **Pi owns the Agent loop** — one runtime, bounded budgets (4 turns / 6 tool
  calls / 10s total / 2s per tool), instead of a homegrown or duplicated loop.
- **FastAPI owns the AI retrieval workload** — Python does embedding/retrieval
  work as a private service; it never confirms or mutates business truth.
- **PostgreSQL owns durable truth** — Tickets/Handoffs/audit survive restarts;
  the migration ledger is once-only and immutable (001–005).
- **Retrieval never authorizes answers** — ranking may reorder candidates; only
  Node Evidence Governance admits an answer.
- **LLM text never proves durable business success** — a tool call counts only
  after the scoped durable read-back matches.

## Validation

- Deterministic unit/contract tests across Node, Python, and the web client
  (lexical default, canonical reconciliation, fail-closed behavior, 0/1/2+
  answerability, runtime budgets).
- Real PostgreSQL gates in CI: identity, business, application, Core A StoreOps,
  Core B RAG registry, composed Job-Ready application (migrations 001–005).
- Cross-language vector E2E: Node → FastAPI → pgvector `vector(1536)` →
  deterministic 1536-profile → Node canonical reconciliation (clean-runner PASS).
- Safety/robustness/holdout/knowledge eval suites (30/100/60/46 cases) pass in
  CI; public retrieval regression passes as a regression gate, not a quality
  acceptance.
- Docker restart-persistence: build/start, auth/FAQ, scoped ticket read-back,
  isolation, retained-volume recreation (clean-runner PASS).
- S7-A deterministic demo smoke: 7/7 curated scenarios PASS with environment
  limitations (local PostgreSQL/Docker unavailable; server-side integration
  evidence from the S6 clean runner, Run `34699201771` / Job `103567849816`).

## Trade-offs

- **Lexical default instead of silent vector switch** — the default retrieval
  mode never silently changes implementation after a failure; vector is an
  explicit opt-in with full configuration. Predictability over opportunistic
  quality.
- **Deterministic vector proof proves integration, not semantics** — the
  `deterministic-test-1536-v1` profile proves the pgvector/FastAPI/Node path
  works end-to-end without claiming semantic retrieval quality.
- **0/1/2+ answerability trades coverage for trust** — ambiguous (2+) evidence
  yields fallback, not a guessed single answer; some answerable-looking queries
  intentionally go unanswered.
- **No speculative infrastructure** — no Redis, Kafka, Kubernetes, or second
  Agent runtime; PostgreSQL plus three services is the entire delivery surface,
  because the evidence objective does not need more.

## Limits / Next roadmap

Job-search V1 limits (current, evidence-backed):

- Real hosted OpenAI embedding: BLOCKED — VALID API CREDENTIAL UNAVAILABLE.
- Retrieval quality acceptance: NOT CLAIMED — GAP-05 unresolved.
- S3 bounded real-provider Golden Path and S4 retrieval ablation (including
  Hybrid/RRF): DEFERRED (owner-approved scope decision); the S5 reranker is NOT
  JUSTIFIED (no measured need).

Successor roadmap (not implemented; requires new explicit user authorization):

- Hybrid/RRF retrieval and a conditional reranker behind a measured-need gate.
- Live WeCom protocol/crypto/customer identity wiring.
- Thin MCP integration.
- Public deployment on the ICP/domain/HTTPS/Nginx path.

No successor roadmap item is claimed as implemented, and no deferral is a global
cancellation of the roadmap.
