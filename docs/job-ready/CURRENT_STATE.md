# Job-Ready Current State

Status: **GOVERNANCE BASELINE / PRE-IMPLEMENTATION**

This file records the authoritative starting point for the final Job-Ready successor sprint. It is intentionally concise and should be updated only when a reviewed checkpoint materially changes the execution state.

## 1. Authoritative predecessor

Repository:

`wanghanyu654321-cell/-agent`

Authoritative predecessor source HEAD for this governance baseline:

`e315073bfdc0de980d7689193bf88d62766e02d5`

Source tree:

`992008594d88a84aa0037e3cf615b37383fcf996`

That source is the PR #9 head for:

`fix/real-source-runtime-evidence-durability-v1`

PR #9 remains a proof-evidence branch and must not be reused as the implementation branch for the Job-Ready successor.

## 2. PR #9 closure state

### Real-Source Runtime Evidence Durability V1

**APPROVED** at source HEAD `e315073bfdc0de980d7689193bf88d62766e02d5`.

The independent Gate verified the fresh external write-once/fsync journal boundary, bounded safe evidence projection, focused durability tests, clean-runner regression evidence, PostgreSQL gates, Safety/Knowledge/Retrieval gates and Docker persistence smoke.

PR #9 independent durability review comment:

`5549632831`

### Final authorized durable real-provider run

Exactly one newly authorized real-provider A/B/C run was completed on the same exact source HEAD with:

- provider/model: `openai-codex / gpt-5.6-sol`;
- `runtimeCaseAttempts = 3`;
- `retries = 0`;
- 8 complete newline-terminated durable journal records;
- `run_completed` present;
- `allThreeCasesPassed = false`.

Safe evidence was published in PR #9 comment:

`5550543622`

Observed case outcomes:

| Case | Actual result | Tools | Authorized evidence | Elapsed | Contract result |
| --- | --- | --- | --- | ---: | --- |
| `A_SINGLE_EVIDENCE` | fallback | `search_faq`, `search_knowledge` | none | 10003 ms | FAIL |
| `B_ZERO_EVIDENCE` | fallback | `search_faq` | none | 7854 ms | FAIL |
| `C_AMBIGUOUS_EVIDENCE` | fallback | `search_faq`, `search_knowledge` | none | 10000 ms | PASS |

Independent Final Gate conclusion for `REAL-SOURCE RUNTIME PROOF V1`:

**REJECTED**.

This rejection applies to the real-source Runtime Proof acceptance contract, not to the already-approved Evidence Durability implementation.

No additional PR #9 A/B/C provider rerun is authorized.

## 3. Recorded Runtime reliability badcases

The final durable run produced two distinct successor engineering signals.

### Badcase A — timeout-sensitive final fallback

`A_SINGLE_EVIDENCE` actually reached both `search_faq` and `search_knowledge` but completed as fallback with no authorized evidence at approximately the existing 10-second overall deadline.

The successor may investigate and repair only the narrow contract problem: already verified admissible evidence must not be incorrectly discarded merely because provider completion occurs around an arbitrary overall timeout boundary.

This must preserve Safety precedence, Evidence Governance, authority and side-effect protections.

### Badcase B — governed knowledge path not reliably reached

`B_ZERO_EVIDENCE` correctly returned fallback but called only `search_faq`; the frozen proof contract required `search_knowledge` to be exercised as the governed ordinary knowledge path.

The successor may make that governed routing/check deterministic where the product contract requires it rather than leaving it to opportunistic model tool selection.

The purpose is reliability, not benchmark gaming.

## 4. Existing high-value capabilities to preserve

The successor starts with substantial approved/frozen engineering evidence already present in the repository, including:

- one Pi-owned Agent Runtime;
- Safety vertical slice and robustness/holdout evaluation;
- governed FAQ/knowledge Evidence admission and grounding;
- tenant/store isolation;
- server-derived identity, roles and capabilities;
- enterprise execution context;
- durable PostgreSQL business boundary;
- Ticket/Handoff persistence and audit projection;
- same-origin React application delivery;
- local Docker + PostgreSQL restart-persistence proof;
- deterministic and real-source retrieval evaluation infrastructure;
- real Pi provider adapter;
- private store knowledge composition;
- bounded real-source runtime proof/evidence harness;
- durability evidence for interrupted external-provider proof execution.

Do not rebuild these capabilities under new names.

## 5. Remaining Job-Ready gaps

The final successor is intentionally limited to the following gaps:

1. **Runtime Reliability Closure**
   - deterministic closure of Badcase A and B without weakening existing governance;
2. **Enterprise WeChat text integration**
   - official channel ingress/egress, callback security, idempotency and internal identity binding;
3. **Thin StoreOps workflow**
   - Knowledge, simple Availability, Booking Intent and Manager Handoff/Needs Attention;
4. **Python/FastAPI + practical RAG**
   - thin retrieval service, pgvector, tenant/store/status metadata filtering and Node Evidence Governance integration;
5. **React StoreOps increment**
   - bounded operational/demo views on top of the existing React application;
6. **Hosted deployment**
   - Linux + domain/HTTPS + Nginx + Docker Compose + Node/FastAPI/PostgreSQL+pgvector;
7. **Job-ready evaluation/troubleshooting evidence**
   - bounded RAG evaluation, structured latency/error evidence, deployment smoke and real incident/runbook evidence where actually observed.

No additional product domain is required for the current job-search objective.

## 6. Explicitly not required before Job-Ready Gate

The following are not blockers and remain out of scope unless explicitly reauthorized:

- ASR;
- full CRM;
- membership/stored value/cashiering/inventory;
- full scheduling/workforce management;
- full booking/payment engine;
- Meituan/Douyin real-time integrations;
- Multi-Agent;
- MCP;
- Redis/Kafka;
- Kubernetes;
- GraphRAG or complex reranking;
- large observability platform.

## 7. Immediate next sequence

The next authoritative sequence is:

```text
1. Governance baseline
   - AGENTS.md
   - this CURRENT_STATE.md
   - JOB_READY_PARALLEL_EXECUTION_DIRECTIVE.md

2. Independent Governance Gate

3. GPT-6 Task 0
   - create docs/job-ready/ARCHITECTURE_CONTRACT.md

4. Independent Contract Gate

5. Parallel implementation
   - GPT-6 Core A: Runtime Reliability + WeCom + StoreOps
   - GPT-6 Core B: FastAPI + RAG
   - Qoder Peripheral C: React StoreOps
   - Qoder Peripheral D: Eval / Deployment Support / Docs

6. GPT-6 shared-file integration

7. Full regression / integration / deployment evidence

8. Independent Job-Ready Final Gate
```

## 8. Current claim boundary

At this checkpoint the repository may truthfully claim the already-approved historical portfolio/enterprise/delivery/evaluation capabilities recorded in existing governed documents.

It must NOT yet claim:

- a successful real-source Runtime Proof V1;
- production readiness;
- a real hosted customer deployment;
- a real beauty-store Pilot;
- Enterprise WeChat integration;
- FastAPI/RAG production integration;
- pgvector production retrieval;
- autonomous customer replies.

Those claims require successor implementation plus independent evidence.
