# Job Search Sprint V1

Status: **EXECUTION CONTRACT — NON-PUBLIC / JOB-SEARCH EVIDENCE SPRINT**

This sprint narrows the existing Job-Ready successor work to the smallest set of changes that can create new, reproducible AI Application Engineer / FDE evidence without weakening the already-approved Runtime, Safety, authority, database, or CI boundaries.

## 1. Authoritative baseline

Repository: `wanghanyu654321-cell/-agent`

Authoritative implementation baseline:

- Source branch: `job-ready/integration-v1`
- Source commit: `8c60f544c5e402f3a4d08c96729cc55f8353e7f0`
- Source tree: `34122e4eb762c1af2ba726a740ead005ff9fa053`
- Known-good workflow run: `34081277022`
- Sprint branch: `job-search/sprint-v1`

The sprint branch starts exactly from the source commit above. Historical PRs, FIRST reports, failed evidence, prior Gate verdicts, and migrations `001`–`004` remain immutable.

The integration baseline remains `FINAL INTEGRATION CANDIDATE / CLEAN-RUNNER VERIFIED / PENDING INDEPENDENT FINAL GATE`. This sprint does not rewrite that verdict.

## 2. Sprint objective

Create a portfolio-ready, truthful, reproducible proof chain for:

```text
Enterprise identity / scope
        ↓
Pi SupportAgentRuntime
        ↓
real retrieval path
        ↓
Node evidence reconciliation / admission
        ↓
answer | fallback | escalation
        ↓
structured harness evidence
```

Then compare retrieval variants without changing the existing answerability or Safety contract.

The priority is **new credible evidence per unit of engineering and review cost**, not framework count, file count, or technology-name coverage.

## 3. Fixed architecture decisions

1. Keep one Pi-owned Agent loop. Do not introduce LangGraph or another Agent runtime.
2. Protect `SupportAgentRuntime`; change it only if a new failing regression demonstrates a narrow defect.
3. Node keeps identity, membership, tenant/store scope, capabilities, Safety, evidence authorization, and business authority.
4. PostgreSQL remains the durable business source of truth.
5. FastAPI remains a private retrieval service, not a second public application backend.
6. Harness is development/evaluation infrastructure. Production code must not depend on Harness.
7. Ranking and answerability stay separate. Ranking may reorder candidates; it cannot manufacture authorization.
8. Existing ordinary answerability remains:
   - 0 admissible candidates → no ordinary answer;
   - exactly 1 admissible canonical candidate → eligible for ordinary answer;
   - 2+ admissible canonical candidates → ambiguous / no ordinary answer.
9. Existing runtime limits remain unchanged: 10,000 ms overall turn, 2,000 ms per tool, maximum 4 Agent turns, maximum 6 tool calls, sequential tool execution.
10. Default production/demo retrieval does not silently switch implementations after a failure. Experimental modes are explicit.

## 4. Execution order

### S0 — Baseline and measurement boundary

This document and the accompanying S1 Gate satisfy the governance part of S0. Core implementation contracts that require code are owned by the first development task.

Minimum evidence identity for every new run:

- run ID;
- source commit and tree;
- dirty/clean state where available;
- dataset/corpus hash;
- runtime/provider/model identity;
- retrieval strategy;
- embedding profile when applicable;
- limits;
- expected case IDs and actual case IDs;
- execution completion state;
- returned evidence IDs, versions, and actual sourceRefs;
- final result type;
- no fabricated zero values for unavailable measurements.

### S1 — Thin Harness skeleton — FIRST CORE DEVELOPMENT

Build only the smallest reusable execution/evidence layer needed before real RAG experiments:

```text
Case / Config
    ↓
Runner
    ↓
existing EnterpriseSupportService / SupportAgentRuntime
    ↓
actual result + safe trace projection
    ↓
Evaluator
    ↓
Report object
```

Required scope:

- minimal versioned run/config/measurement structures;
- deterministic runner;
- sourceRef/version completeness checking;
- missing/duplicate case detection;
- config/data hash mismatch detection;
- interrupted run must not become complete;
- existing metrics reused where compatible;
- no generic replay platform, trace database, dashboard, scheduler, or new business verification framework.

Acceptance is defined in `docs/job-ready/evidence/HARNESS_S1_GATE_V1.md`.

### S2 — Real embedding + pgvector + retrieval E2E

After S1 passes:

- approve one explicit embedding profile before use;
- add a new migration after `004`; never rewrite `001`–`004` and never merely remove `gap03_profile_unresolved`;
- bind model/revision/dimension/profile/location/egress policy;
- run actual ingest → search → Node canonical reconciliation → Runtime evidence path;
- keep bad/missing profile fail-closed;
- use deterministic embedding only where the evidence claim is integration correctness, not real retrieval quality.

### S3 — Bounded real-provider Golden Path

After real retrieval is independently runnable:

- define a fresh source commit and a new bounded provider-evidence contract;
- do not reuse or rewrite PR #9 A/B/C evidence;
- zero automatic retries;
- explicitly approved case count, token/cost ceiling, and permitted data;
- record failures as evidence rather than tuning until green.

This step has higher priority than a reranker.

### S4 — Retrieval ablation

Compare one factor at a time:

```text
R0 current lexical
R1 ranked lexical
R2 vector
R3 lexical + vector simple deterministic merge
R4 same candidate population + RRF ranking
R5 optional real reranker
```

R3 exists to distinguish benefit from a second recall path from benefit caused by RRF itself.

Rules:

- use the same scope/corpus/profile/floor/limits for adjacent comparisons;
- preserve the full admissible candidate set for 0/1/2+ answerability;
- ranking Top-K metrics do not authorize Top-1 answers;
- timeouts are failures and stay in latency/completeness reporting;
- no result is required to beat the baseline in order for the experiment to be valid.

### S5 — Optional reranker

Only run when R0–R4 show a concrete reason to test it and an implementation can fit the unchanged runtime budget. No empty adapter is required for resume keyword coverage.

A useful negative result is acceptable: if quality gain does not justify latency/cost or ambiguity is unchanged, leave it disabled.

### S6 — Full regression and existing CI

Do not redesign the known-good CI. Add only focused commands that actually exist and pass, then run the current complete Gate on the exact final source.

### S7 — Job-search evidence package and freeze

Reuse the existing UI/API. No new showcase product is required.

Final package:

- one reproducible comparison report with failures and limitations;
- one exact commit/tree with complete CI evidence;
- 3–5 minute demonstration using existing UI/API;
- one-page project explanation: problem → architecture → validation → trade-offs → limits;
- at least two observed badcases or trade-offs;
- owner can explain the request path and change/re-run one case without an agent inventing the answer.

Then freeze feature expansion.

## 5. Explicitly out of scope for this sprint

The following are deferred and must not block S1–S7:

- live WeCom protocol/crypto/customer identity wiring;
- complete Pi session recovery across process restart;
- MCP implementation (optional bonus only after sprint core is complete);
- ICP, domain, public HTTPS, Nginx deployment proof;
- CI multi-job redesign or Actions modernization;
- Redis, Kafka, Kubernetes, GraphRAG;
- LangGraph or second Agent loop;
- Multi-Agent;
- Answerability V2 or multi-evidence synthesis;
- new business/product features;
- production-readiness claim.

Existing tests for deferred capabilities remain in the Gate; deferral does not authorize deleting evidence.

## 6. Allowed claims during the sprint

Allowed only when directly supported by the corresponding run:

- deterministic contract proof;
- PostgreSQL integration/durability proof;
- real vector retrieval proof;
- bounded real-provider evidence;
- lexical/vector/hybrid/RRF experiment results;
- explicit failure/timeout/blocked status.

Do not claim:

- production deployment;
- live WeCom;
- real-provider PASS before a fresh authorized run passes its own contract;
- retrieval quality PASS before approved thresholds exist;
- reranker benefit before measured;
- sourceRef correctness from a record that did not actually capture returned sourceRef.

## 7. Change discipline

Every implementation task must receive:

1. exact source SHA;
2. allowed files;
3. prohibited files/behaviors;
4. focused test command;
5. acceptance Gate;
6. rollback boundary.

Shared authority files, migrations, answerability logic, runtime cancellation, and application composition require core-owner review. Pure functions and deterministic tests may be delegated after their contract is frozen.

No implementation task may silently increase timeout budgets, relax scope checks, change final evidence rules, rewrite historical reports, or turn an experimental retrieval mode into the default.
