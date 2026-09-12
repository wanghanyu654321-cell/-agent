# Thin Harness S1 — Independent Review V1

Verdict: **APPROVED WITH CONDITIONS**

Reviewed implementation:

- Repository: `wanghanyu654321-cell/-agent`
- Branch at implementation review: `job-search/sprint-v1`
- Implementation commit: `37fa81c3311bec4420b6202abb76107118f12efd`
- Implementation tree: `79acb67d91588c7357b1dad5b9f43ebde98ebd83`
- Parent / S1 Gate baseline: `a55843fa95465d3e1d4e4215e53e8f08d1cd22cc`
- Governing Gate: `docs/job-ready/evidence/HARNESS_S1_GATE_V1.md`

This review is independent of the implementation report. It was performed from the GitHub commit, branch state, changed-file comparison, implementation diff, and committed tests. The reviewer did **not** rerun the local commands reported by the implementer.

## 1. Scope review

The implementation is exactly one commit ahead of the S1 Gate baseline and adds only these six files:

- `harness/contracts.ts`
- `harness/evaluate.ts`
- `harness/runner.ts`
- `harness/suites.ts`
- `tests/harness/integrity.test.ts`
- `tests/harness/runner.test.ts`

No reviewed diff changes `src/index.ts`, production enterprise application files, `src/retrieval/**`, `ai-service/**`, migrations, workflow files, Compose, Pi pins, or historical evaluation artifacts.

**Scope result: PASS.**

## 2. Architecture review

The new layer depends on the existing `EnterpriseSupportPort.respond` contract and existing SupportResult types. `runSuite()` dispatches through an injected `HarnessService`; it does not construct a second Agent loop, duplicate Safety/authority/evidence rules, or introduce a new production endpoint.

The direction remains:

```text
Evaluation Harness
  -> existing Enterprise support service / Runtime boundary
```

No production path imports Harness in the reviewed diff.

**Architecture result: PASS.**

## 3. Evidence semantics

The implementation correctly keeps S1 narrow:

- `completionState=complete` means execution population/integrity completeness, not answer or retrieval quality.
- `quality` is fixed to `not_evaluated`.
- actual returned evidence is projected from `SupportResult.evidence` with `id/version/sourceRef/kind`.
- missing returned version/sourceRef is rejected rather than backfilled from expected/corpus metadata.
- `attemptedOperations` is explicitly documented as Runtime-recorded attempted operations; it is not represented as a Pi-emitted event or durable business-success proof.
- a thrown service error becomes `execution_error`, not an empty successful retrieval.
- when the existing Runtime catches a retrieval dependency error and returns fallback, S1 does not invent observability it does not have; `retrievalStatus` remains `unverified`.
- raw answer text, transcript/session events, session ID, query/customer/context and raw exception text are excluded from the Harness projection tested in the commit.

**Evidence semantics result: PASS.**

## 4. Integrity / negative controls

Committed tests cover all mandatory S1 false-PASS controls:

1. missing expected case;
2. duplicate measurement / duplicate suite case;
3. suite/config/corpus drift and declaration-hash drift;
4. returned evidence version/sourceRef tampering;
5. missing completion marker / interrupted execution relabelled complete;
6. thrown dependency/service error distinct from returned empty fallback, including Runtime-caught retrieval error remaining unverified;
7. policy-owned knowledge attempt not represented as a Pi tool event.

Additional committed checks cover case reordering/unexpected IDs, shared-context isolation, last-case abort/throw, unsupported limits, no sourceRef backfill, no raw sensitive projection, and attempted handoff not being interpreted as durable business success.

The real-boundary test constructs the existing `EnterpriseSupportService` and `SupportAgentRuntime` with the faux Pi provider and verifies the existing 0/1/2+ evidence outcomes without changing product code.

**Integrity design result: PASS.**

## 5. Important limitations retained correctly

These are not S1 defects:

- The receipt hash is an integrity comparison aid, not a cryptographic signature or attestation. It is meaningful only when retained independently from the editable run report.
- S1 does not prove the supplied `RunConfig` equals actual provider/database process state; composition remains responsible for truthful declaration.
- S1 intentionally does not score answer quality or retrieval quality.
- S1 cannot infer whether a Runtime-caught retrieval error was a genuine zero-result search from `SupportResult` alone.
- S1 does not cancel an already-dispatched enterprise call; the existing Runtime continues to own its deadlines/side effects.
- S1 does not execute real embedding, real vector retrieval, real external provider, PostgreSQL/Docker delivery, Hybrid/RRF, or public deployment.

## 6. Pi native AgentHarness / telemetry note

Pi 0.84.3 already exposes its own runtime-oriented `AgentHarness` and Pi telemetry surfaces. That does not make this S1 Evaluation Harness redundant: Pi AgentHarness owns agent/session/operation execution, while this sprint layer owns case population, experiment declaration, measurement integrity and comparison evidence.

S1 does not currently need event-level telemetry, so the absence of a Pi telemetry dependency is not a rejection condition. If later S2/S3 work adds provider/tool/retrieval spans, latency or event-origin claims, it must first inspect and reuse Pi 0.84.3 telemetry/event surfaces where sufficient rather than inventing a parallel Runtime lifecycle trace model.

## 7. Independent execution evidence condition

At review time GitHub reports **no commit statuses and no workflow run** for implementation commit `37fa81c3311bec4420b6202abb76107118f12efd`.

The implementer reported local success for focused Harness/RAG tests, direct Runtime/enterprise regressions, `npm run check`, `npm run build`, lint and diff checks. Those results are useful implementation evidence but were not independently rerun by this reviewer and must not be described as clean-runner CI for this SHA.

Therefore the only condition on this approval is:

**C1 — Before S1 is promoted as independently clean-runner verified or before a final sprint Gate, bind the exact S1 implementation (or a descendant with only reviewed documentation/Gate changes) to an independent clean-runner execution of the focused S1 suite plus the existing required integration Gate. Preserve the exact source/tree and do not rewrite historical FIRST/PR #9 evidence.**

This condition does **not** require a redesign of the current GitHub Actions workflow and does not block starting the next bounded S2 development contract. It does block claiming independent CI verification for S1 until that evidence exists.

## 8. Final verdict

**APPROVED WITH CONDITIONS**

S1 is acceptable as the sprint's thin Evaluation Harness foundation. No code correction is required from this review before S2. The next development step may define S2 Real Embedding + pgvector + retrieval E2E, provided it preserves the existing answerability/Safety contract and treats S1's remote clean-runner evidence as an outstanding evidence condition rather than silently upgrading it to PASS.
