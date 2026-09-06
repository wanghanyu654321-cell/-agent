# Core B Python evidence — 2026-09-06

Scope: `ai-service/**` only. Branch/base were supplied by the coordinating Core B
task: `job-ready/core-b-fastapi-rag-v1`,
`7c9b694d586fe4c557a195b554a97cc89e5c8f24`.
No commit, branch change, shared composition edit, or external call was made by
this Python subtask. The parent task owns the final commit/tree/evidence report.

## Implemented

- `rag_service/contracts.py`: strict required Pydantic wire fields and shared
  Unicode fixture parity; no coercion, extra fields, blank IDs/query, NUL in
  IDs/query, unpaired surrogates, invalid hashes, or nonfinite scores.
- `rag_service/core.py`: immutable canonical hash validation; 16,000-code-point
  document bound; contiguous zero-overlap 2,000-code-point chunks; exact JSON
  tuple chunk IDs; injected-vector cosine/floor/group/rank semantics; registry
  filtering, conflict and dependency failures, idempotency, full publication.
- `rag_service/app.py`: exactly three service-authenticated endpoints; strict
  JSON/body/response bounds; finite search/ingestion boundaries; propagated ASGI
  disconnect/cancellation; safe error envelope; default unavailable service.
- `rag_service/postgres.py`: actual parameterized SQL adapter behind an injected
  async connection factory. Node-compatible cross-version advisory document
  lock plus generation lock, SELECT-only registry reads, transaction inserts,
  exact metadata filtering, explicit scan overflow failure, schema/profile/role
  readiness checks. SQL-wire tests are not PostgreSQL execution evidence.
- `tests/test_core.py`, `test_http.py`, `test_postgres_boundary.py`, and
  `test_shared_contract.py`; exact local dependency pins and scoped README.

## Commands and results

From `ai-service`:

```text
python -B -m unittest discover -s tests -v
Ran 29 tests in 1.161s — OK (29 passed; zero skipped)
```

All nine Python source/test files parsed with `ast.parse`; no syntax errors.
`git diff --check` and individual `git diff --no-index --check -- NUL` checks of
the new implementation files produced no whitespace errors. New files were
untracked during the subtask; parent must include them in final diff review.

Observed RED/GREEN evidence:

1. Initial `python -B -m unittest discover -s tests -v` failed the assertion
   that the authorized service implementation existed. Tests for core, HTTP and
   DB boundaries were then added before their modules; each focused discovery
   showed the missing-module import error before implementation, followed by
   passing behavior tests after implementation. Import errors alone are not
   claimed as a complete behavior-level RED proof.
2. `python -B -m unittest discover -s tests -p test_core.py -v` failed
   `test_unloadable_embedding_and_unready_db_fail_before_work` because
   `RetrievalError` was not raised. Adding loadability/readiness checks to health,
   search and ingestion made the test pass.
3. `python -B -m unittest discover -s tests -p test_shared_contract.py -v`
   produced six assertion failures: three missing required response fields were
   accepted, and three blank/NUL query cases were accepted. Removing DTO defaults,
   explicitly populating output fields, and aligning query validation made all
   shared fixtures and negative cases pass.
4. `python -B -m unittest discover -s tests -p test_core.py -v` failed the
   multiple-active-version rejection assertion. Adding explicit per-document
   active-version conflict detection made it pass.

Two test-harness defects were corrected without weakening behavior assertions:
a short credential substring could randomly occur in a generated UUID, so the
test now checks a full private-credential sentinel; a 10 ms test deadline could
expire before its embedding started on Windows, so it now allows 200 ms while
the embedding still waits indefinitely and must be cancelled. Final full tests
passed with cancellation and no-late-result assertions retained.

## Explicit limitations

- `GAP-03 BLOCKED`: no approved real model/revision/artifact/dimension/location/
  egress profile; no real embedding implementation or download. The unresolved
  SQL guard keeps the index unavailable. Test dimensions are synthetic only.
- `GAP-04 BLOCKED`: no real relevance floor/calibration approval. Missing floor
  fails closed; test floor does not configure a real deployment.
- Real PostgreSQL/pgvector connection, schema execution, privileges, concurrency
  and cancellation have not been exercised here. The installed environment has
  no psycopg; the adapter accepts an explicitly supplied driver connection.
- `INTEGRATION GAP`: driver pin/composition, approved embedding profile/adapter,
  ingestion job deadline, migration ledger, shared Node composition, service
  image/Compose and hosted deployment remain outside this subtask.
- No Ruff or mypy executable/library was available. Runtime tests, required
  Pydantic validation and syntax parsing are the alternative local evidence;
  no static lint/type-check PASS is claimed.
- No dependency installation, clean-environment package build, image build,
  quality holdout evaluation, provider call, or deployment was performed.

External calls = **0**. Real embedding calls = **0**. No production readiness,
vector answerability, retrieval-quality PASS, or independent approval is claimed.

## Coordinated Node/Core B verification

The parent task reviewed all new files and independently reran Python tests:
29 passed, zero skipped. The Node adapter, migration and tests stay within the
Core B allowlist; no existing tracked implementation or governance file changes.

- `npx vitest run tests/job-ready-rag`: 44 passed, 1 skipped (real PostgreSQL).
- `npm test`: 390 passed, 22 skipped, zero failed. The additional skipped test
  requires `POSTGRES_RAG_TEST_URL` and preinstalled pgvector; neither a live RAG
  database proof nor SQL-wire mocks are represented as PostgreSQL PASS.
- `npm run build`, `npm run check`, `npm run integrity`: passed. A nullable
  test-only reader type annotation detected by TypeScript was corrected;
  no behavior assertion was weakened.
- Existing offline evaluation exports (without report-writing entrypoints):
  Safety robustness 100/100, blind Safety holdout 60/60, governed Knowledge
  46/46, controlled public retrieval, public-real retrieval and public-real
  runtime routing all passed. Historical artifacts were not regenerated.
  Public-real Top-1 remained 0.96 and Recall@3 1.0; runtime routed outcome
  accuracy was 1.0, not a claim that evidence trace accuracy was 1.0.

Node regressions cover strict metadata reconciliation, bounded canonical
rehydration, scoped requests, malformed/retired/synthetic evidence, dependency
failure versus no-answer, Unicode fixtures, and 0/1/2/3-document paths through
the unchanged Pi-backed SupportAgentRuntime with persisted audit and faux
provider tool events. No real model is used.

Adversarial review reproduced an ingest response-completion cancellation race:
the new test failed because a completed response was accepted after abort.
Adding a final signal check made both search and ingest completion-race tests
pass. A same-version PostgreSQL DATE serialization issue and coerced DTO fields
were also covered before their minimal fixes. A registry outage with empty
Python candidates remains unavailable, not a successful empty result.

This checkpoint supplies independently testable Core B pieces, not shared
application integration. Final Integration still owns migration registration,
dependency/driver deployment, trusted composition and production readiness.
