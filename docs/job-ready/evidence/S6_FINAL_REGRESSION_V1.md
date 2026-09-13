# S6 Final Regression Evidence (V1)

**Date:** 2026-09-13

## Source

- Repository: `wanghanyu654321-cell/-agent`
- Branch: `job-search/sprint-v1`
- S6 baseline commit: `2c52c993c3ae5d79419f530659bcedc21a9b2bce`
- S6 baseline tree: `061e69d17e2cc8600ca3912a2c48ebd6f98bd4a7`

## Layer 1 — Local Windows Verification (deterministic subset)

**Environment:** Windows 11 25H2, Node v24.18.0, npm 11.16.0, Python 3.11.15

All locally executable deterministic checks PASS:

- **check** (biome + tsgo --noEmit) PASS — 161 files, 0 errors
- **build** (tsgo + vite build) PASS — 31 modules
- **integrity gate** PASS (tags / Pi pins / runtime boundary / customer-tool boundary intact)
- **Node full regression** PASS — 97 files: 89 passed / 8 skipped / 0 failed; 640 tests: 602 passed / 0 failed / 38 skipped (all skips are PostgreSQL integration tests requiring POSTGRES_TEST_URL / POSTGRES_RAG_TEST_URL)
- **test:job-ready** PASS — 246 tests: 229 passed / 0 failed / 17 skipped (PostgreSQL subset)
- **Python RAG** (ai-service unittest) PASS — 43 ran: 39 passed / 0 failed / 4 skipped ('disposable PostgreSQL unavailable')
- **eval:safety** PASS (30 cases, passRate=1); **eval:safety:robustness** PASS (100 cases, passRate=1); **eval:safety:holdout** PASS (60 cases, passRate=1); **eval:knowledge** PASS (46 cases, passRate=1); **eval:retrieval:public** PASS (gatePassed=true); **eval:retrieval:public-real** PASS (gatePassed=true)
- **Answerability 0 / 1 / 2+ contracts** PASS (routing precedes ranking; multi-evidence never truncated into single-evidence authority)
- **Safety / Ticket / Handoff / tool contracts** PASS; **runtime budget contract** PASS (10s / 2s / 4 turns / 6 tool calls / sequential); **lexical default** PASS

PostgreSQL and Docker checks locally NOT EXECUTED — environment unavailable (no Docker runtime, no reachable PostgreSQL, POSTGRES_TEST_URL / POSTGRES_RAG_TEST_URL unset).

**Explicit statement:** these local omissions are an environment limitation, NOT an implementation PASS for those paths.

## Layer 2 — Independent GitHub Clean-Runner (full coverage of local omissions)

- **Workflow:** Customer Support Agent Gate
- **Run:** 34699201771
- **Job:** 103567849816
- **Conclusion:** success
- **CI checkout merge commit:** `59fa2fbb7783f0f9476bcfed8466a0f8ce4ddfad`
- **CI checkout tree:** `061e69d17e2cc8600ca3912a2c48ebd6f98bd4a7`

**Explicit statement:** The CI tree exactly equals the S6 baseline tree.

Verified CI coverage (all PASS):

- integrity gate PASS
- Node full regression PASS
- PostgreSQL identity 6/6 PASS
- PostgreSQL business 5/5 PASS
- PostgreSQL application 10/10 PASS
- Core A PostgreSQL 13/13 PASS
- Core B PostgreSQL 1/1 PASS
- Job-Ready PostgreSQL 2/2 PASS
- Python RAG 43/43 PASS, 0 skip
- vector-postgres cross-language E2E 1/1 PASS
- build PASS
- check PASS
- safety eval PASS
- robustness eval PASS
- holdout eval PASS
- knowledge eval PASS
- existing retrieval regressions PASS
- Docker build/start PASS
- Docker persistence write PASS
- Docker recreate/read PASS

## Upstream Reviewer Verdict

```text
S6 FINAL REGRESSION GATE — PASS
```

Reason: Local environment-dependent omissions are fully covered by an independent clean-runner executing the exact same source tree.

## Limitations (verbatim)

```text
REAL HOSTED OPENAI EMBEDDING:
BLOCKED — VALID API CREDENTIAL UNAVAILABLE

No hosted-provider PASS is claimed.

RETRIEVAL QUALITY ACCEPTANCE:
NOT CLAIMED — GAP-05 unresolved.

Do not claim that the public retrieval regression constitutes semantic/vector retrieval quality acceptance.
```

## Protected Contracts (verified unchanged)

- max turns 4
- max tool calls 6
- total budget 10s
- per-tool budget 2s
- sequential execution
- Safety fail-closed
- 0 evidence → fallback
- 1 evidence → answer eligible
- 2+ ambiguous → fallback
- lexical default
- pgvector dimension 1536
- migrations 001–005 preserved
- Ticket/Handoff preserved
- S1 Eval Harness preserved
