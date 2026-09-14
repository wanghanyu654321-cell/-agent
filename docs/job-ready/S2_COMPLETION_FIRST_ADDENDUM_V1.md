# S2 Completion-First Addendum V1

Status: **BINDING EXECUTION ADDENDUM — S2**

This addendum narrows S2 implementation behavior. It does not change the frozen embedding profile, migration safety rules, egress boundary, or S2 acceptance Gate.

## 1. Default engineering rule

S2 is a **completion task, not a retrieval refactor**.

The implementation priority is:

```text
existing seam
  -> fill missing implementation
  -> add the smallest composition hook required
  -> prove it with focused tests
```

Do not restructure working modules merely to make the architecture look cleaner.

Refactoring is authorized only when the current structure materially blocks one of:

- correctness;
- tenant/store/profile isolation;
- fail-closed behavior;
- cancellation/deadline correctness;
- transactional integrity;
- testability of the required S2 path;
- replaceability needed by the frozen S2 contract.

If a refactor is proposed, the implementer must first state the blocking defect and why a narrower completion patch is insufficient.

## 2. S2 target shape

Preserve the current retrieval boundary and complete only the missing Vector implementation:

```text
                 existing RetrievalService
                        |
            +-----------+-----------+
            |                       |
     existing lexical            vector
       (unchanged)          (S2 completes this path)
```

S2 does not create Hybrid. Hybrid/RRF remain later work.

## 3. Prefer existing code over new abstractions

Reuse before adding:

- existing `RetrievalService` contract;
- existing `Embedding` protocol;
- existing `Repository` protocol;
- existing `RetrievalService` Python core;
- existing PostgreSQL RAG repository;
- existing `FastApiRetrievalService`;
- existing `PostgresRagRegistry`;
- existing Enterprise application composition;
- existing migration ledger;
- existing Node canonical reconciliation.

A new interface/factory/manager is not justified if an existing seam can carry the required behavior.

## 4. Explicit anti-refactor rules

S2 must not, unless required by a demonstrated blocking defect:

- move existing retrieval files for folder aesthetics;
- rename existing public contracts;
- introduce a generic DI/container framework;
- replace `RetrievalService` with a new abstraction hierarchy;
- rewrite lexical retrieval;
- rewrite Node canonical reconciliation;
- rewrite the Python RAG core;
- merge lexical and vector into a new Hybrid pipeline;
- create generic provider registries/plugin systems;
- create a new application service layer around FastAPI;
- migrate Pi Runtime to Pi `AgentHarness`;
- change business authority or evidence admission architecture.

## 5. Minimal authorized change classes

The expected S2 implementation should stay within these change classes:

1. one successor migration after `004`;
2. one small hosted embedding implementation and deterministic test embedding;
3. minimal FastAPI bootstrap/composition needed to construct the existing RAG service;
4. minimal Node vector-mode composition using existing `FastApiRetrievalService` and `PostgresRagRegistry`;
5. focused tests and exact dependency/config updates required by those changes.

If the implementation grows beyond these categories, stop and justify the expansion before proceeding.

## 6. Refactor decision test

Before any non-trivial refactor, answer:

1. What existing behavior is blocked?
2. Can it be completed by adding an adapter/helper behind the current contract?
3. What measurable benefit does the refactor add now?
4. What new regression surface does the refactor create?

Proceed only when the benefit clearly exceeds the completion-only path.

## 7. Review consequence

The independent S2 review will treat unnecessary structural churn as a negative signal even if tests pass.

A smaller patch that closes the real vector path with preserved contracts is preferred over a broader architecture cleanup.

The intended S2 claim is:

> Completed the repository's already-designed Vector Retrieval path and proved it end-to-end.

The intended claim is not:

> Rebuilt the repository's RAG architecture.
