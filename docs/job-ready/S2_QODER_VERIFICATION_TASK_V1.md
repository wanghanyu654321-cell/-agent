# S2 Real RAG — Qoder Verification Task V1

Status: **LOW-RISK VERIFICATION CONTRACT — QODER**

Qoder does not own S2 architecture or core implementation. It is used after Codex has pushed the S2 implementation commit.

## 1. Role boundary

Qoder may:

- run already-defined test commands;
- reproduce deterministic fixtures;
- collect pass/fail/skip summaries;
- capture sanitized logs/evidence;
- produce a PASS/FAIL matrix;
- rerun a single failing deterministic case to confirm reproducibility;
- make low-risk report/Markdown formatting changes only if explicitly requested.

Qoder must not modify:

- migrations;
- Python embedding/provider/composition code;
- PostgreSQL repository logic;
- Node retrieval/application composition;
- Runtime/Safety/answerability logic;
- timeouts/cancellation semantics;
- dependency pins;
- GitHub Actions;
- historical evidence.

If a test fails because code appears wrong, report the failure and minimum reproduction. Do not fix core code. Core fixes return to Codex GPT-6.

## 2. Preconditions

Do not start until a Codex S2 implementation commit/tree is supplied.

Record before running anything:

- branch;
- exact commit SHA;
- exact tree SHA;
- clean/dirty state;
- OS/runtime versions where readily available.

If the working tree is dirty before verification, stop and report it.

## 3. Verification classes

### A. Simple static/build checks

Run the implementation-supplied commands for:

- `npm run check`;
- `npm run build`;
- `git diff --check` against the declared S2 baseline/implementation boundary where applicable.

### B. Node focused tests

Run the exact focused Node tests created/identified by Codex for:

- vector env/composition;
- FastAPI adapter/canonical reconciliation;
- lexical-default regression;
- 0/1/2+ answerability regression;
- S1 Harness regression.

Do not substitute broader or different tests without recording the difference.

### C. Python focused tests

Run the exact focused Python tests created/identified by Codex for:

- deterministic embedding validation;
- hosted-provider mock request/response validation;
- FastAPI fail-closed behavior;
- timeout/cancellation;
- PostgreSQL deterministic ingest/search where the local environment supports it.

### D. Real PostgreSQL/Docker deterministic verification

If the repository-provided deterministic PostgreSQL/Docker path is executable in the current environment, run it exactly as documented.

Record:

- migration result;
- ingest outcome;
- second-ingest outcome;
- search outcome;
- scope/profile rejection cases;
- any skips or unavailable prerequisites.

If Docker/PostgreSQL is unavailable, report `NOT EXECUTED — ENVIRONMENT UNAVAILABLE`. Do not label it PASS.

## 4. Real hosted embedding boundary

Qoder must not independently execute the paid hosted OpenAI embedding run.

That run requires explicit user approval of the external call and budget under `REAL_RAG_S2_GATE_V1.md`.

Qoder may later execute a user-approved documented command only if it is explicitly assigned, but must not expose API keys or private corpus text.

## 5. Required output

Return one concise verification packet:

### A. Source
- branch
- commit
- tree
- clean/dirty state

### B. Commands
Exact commands actually executed.

### C. Results matrix
For each command/test group:
- PASS / FAIL / SKIP / NOT EXECUTED
- passed count
- failed count
- skipped count
- relevant duration if readily available

### D. First failure
If anything fails, report the first reproducible failure with:
- command
- test name
- minimal error excerpt
- whether rerun reproduces

Do not diagnose by editing code.

### E. Contract checks
State whether verification observed any evidence of:
- lexical default changed;
- Runtime limits changed;
- answerability changed;
- migration 001–004 changed;
- hosted calls occurring unexpectedly.

### F. Evidence limitations
Explicitly distinguish:
- locally reproduced deterministic evidence;
- tests not run due to environment;
- real hosted embedding evidence not executed.

## 6. Handoff rule

- Simple execution failure/environment problem -> report to reviewer.
- Suspected implementation defect -> return to Codex GPT-6 with minimum reproduction.
- Architecture/contract ambiguity -> return to reviewer; Qoder must not decide it.
