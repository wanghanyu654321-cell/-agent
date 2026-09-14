# Thin Harness S1 Gate V1

Status: **IMPLEMENTATION ACCEPTANCE GATE — NOT YET PASSED**

This Gate applies only to Sprint S1: the first core development increment after `job-ready/integration-v1@8c60f544c5e402f3a4d08c96729cc55f8353e7f0`.

Passing this Gate proves that the repository has a minimal, truthful, deterministic Harness boundary suitable for later real-RAG and provider experiments. It does **not** prove real vector quality, provider quality, production readiness, live WeCom, or public deployment.

## 1. Source and scope

Sprint branch: `job-search/sprint-v1`

Authoritative base before sprint documentation:

- commit: `8c60f544c5e402f3a4d08c96729cc55f8353e7f0`
- tree: `34122e4eb762c1af2ba726a740ead005ff9fa053`

S1 implementation must start from the current sprint branch and preserve the baseline semantics below.

## 2. Required implementation outcome

The Harness must provide one minimal execution path:

```text
suite case + frozen config
        ↓
runner
        ↓
existing enterprise service / existing SupportAgentRuntime
        ↓
safe actual measurement
        ↓
evaluation
        ↓
complete or incomplete report object
```

The Harness is allowed to observe and evaluate existing application behavior. It is not allowed to own Agent execution, Safety decisions, authority, evidence admission, business persistence, or provider selection.

## 3. Required minimum data

Every completed Harness run must bind at minimum:

- `runId`;
- source commit and tree or an explicit unavailable marker in unit fixtures;
- suite/dataset identity and hash;
- corpus/config identity and hash where applicable;
- runtime mode;
- provider/model identity when known;
- retrieval strategy;
- embedding profile when applicable;
- runtime limits;
- expected case IDs;
- actual case IDs;
- per-case final result type;
- actual returned evidence IDs;
- actual returned evidence versions;
- actual returned sourceRefs when the execution path exposes them;
- run completion state.

Unknown external measurements must remain `null`/`unknown`/absent according to the frozen S1 contract. They must not be filled with `0` and then interpreted as measured values.

## 4. Mandatory negative controls

S1 cannot PASS unless focused tests prove all of the following are rejected or reported incomplete:

1. one expected case is missing;
2. one case appears more than once where uniqueness is required;
3. suite/config/corpus hash does not match the run declaration;
4. returned evidence version or sourceRef is changed after execution;
5. execution stops before the explicit completion marker but a report attempts to claim complete;
6. retrieval/service error is represented as an empty successful result;
7. a policy-owned operation is represented as a Pi tool event if the chosen safe trace projection includes event origin.

A test need not construct a universal evidence-verification framework. It only needs to prove these concrete false-PASS modes cannot pass the S1 report path.

## 5. Existing behavior that must not change

S1 must not change:

- Pi package pins or Pi Runtime ownership;
- `SupportAgentRuntime` turn/tool limits;
- 10,000 ms overall timeout;
- 2,000 ms per-tool timeout;
- sequential tool execution;
- tenant/store/customer authority derivation;
- Safety precedence;
- ordinary 0 / 1 / 2+ evidence authorization semantics;
- Ticket/Handoff idempotency and persistence semantics;
- current default lexical retrieval behavior;
- historical reports, FIRST artifacts, PR #9 evidence, or migrations `001`–`004`;
- Docker/CI claims.

If an S1 test exposes a pre-existing product defect, record the failing case and stop. Do not expand S1 into an unreviewed Runtime repair.

## 6. Recommended file boundary

Codex may choose an equivalent minimal layout if repository conventions justify it, but S1 should remain approximately within:

```text
harness/
  contracts.ts
  runner.ts
  evaluate.ts
  suites.ts

tests/harness/
  runner.test.ts
  integrity.test.ts
```

A tiny composition/helper file is allowed only if necessary to call the existing enterprise service without duplicating application logic.

Do not create:

- a trace database;
- Web dashboard;
- generic replay scheduler;
- second provider framework;
- second Runtime abstraction hierarchy;
- new persistence platform;
- new Agent loop;
- new product endpoint solely for Harness;
- generic plugin framework.

## 7. Dependency direction

Required:

```text
Harness
  ↓
existing public/service contracts
  ↓
EnterpriseSupportService / SupportAgentRuntime
```

Forbidden:

```text
production application
  ↓
Harness
```

No file under the normal production startup path may import Harness.

## 8. Measurement and sourceRef rule

The frozen historical retrieval measurement lacks actual returned `sourceRef`. S1 may introduce a new sprint-specific measurement shape that includes actual returned sourceRefs.

Rules:

- never mutate the historical frozen DTO to make old evidence appear richer;
- never backfill actual sourceRef from `expectedSourceRefs`;
- old records remain `sourceRef_unverified` if they did not capture it;
- new sprint reports and old FIRST reports stay separate.

## 9. Focused verification

Codex must add and run focused tests for the S1 files. The exact command may follow actual file names, but the expected shape is:

```text
npx vitest --run tests/harness/runner.test.ts tests/harness/integrity.test.ts evals/job-ready-rag
```

Also run the existing checks most directly coupled to the changed boundary if imports/contracts require them.

Do not modify `.github/workflows/customer-support-agent-gate.yml` merely to make S1 appear integrated. Workflow wiring is a later integration action after the new commands exist and pass.

## 10. Evidence required for review

S1 review packet must contain:

1. exact implementation commit SHA and tree;
2. changed file list;
3. focused test command and complete result summary;
4. statement of whether `SupportAgentRuntime`, migrations, workflow, or production startup files changed;
5. one example complete Harness report fixture/output;
6. proof that each mandatory negative control fails closed;
7. any discovered pre-existing defect or unresolved ambiguity;
8. no claim that real embedding or real provider was executed unless separately authorized and actually run.

## 11. Verdict vocabulary

Review uses exactly one of:

- `APPROVED` — all S1 requirements satisfied;
- `APPROVED WITH CONDITIONS` — S1 is usable but a bounded non-safety issue remains and is explicitly listed;
- `REJECTED` — behavior or evidence integrity violates this Gate;
- `INFORMATION INSUFFICIENT` — evidence is incomplete or not bound to the reviewed source.

A green focused test alone is not enough if the implementation violates scope or changes protected Runtime semantics.

## 12. Stop conditions

Stop S1 and request review if implementation would require any of the following:

- changing ordinary answerability semantics;
- changing Safety precedence;
- increasing Runtime/tool timeout budgets;
- changing migration schema;
- adding a new external model/provider call;
- adding Hybrid/RRF/Reranker logic;
- modifying real business side-effect semantics;
- changing default retrieval mode;
- widening tenant/store authority;
- rewriting historical evidence.

Those belong to later sprint steps and require their own contracts.
