# Thin FastAPI Candidate Evidence service

Core B implements the unblocked `job-ready-v1` contract only. Node remains the
approved-registry writer and final Evidence Governance authority. Python cannot
approve knowledge, grant scope, change business records, or produce an answer.

## Local verification

Python 3.11.15 was used with the exact versions recorded in `requirements.txt`
and `requirements-test.txt`. No packages or models were installed during this
implementation. In an isolated environment with those dependencies available:

```powershell
cd ai-service
python -B -m unittest discover -s tests -v
```

Tests consume `../tests/job-ready-rag/contract-fixture.json` together with the Node
tests. All corpus/vector examples are synthetic fixtures, not approved private
knowledge. The DB-wire tests use a recording connection; they do not demonstrate
a successful PostgreSQL connection, pgvector migration, or real indexing.

## Private HTTP interface

Only `GET /health`, `POST /knowledge/ingest`, and `POST /knowledge/search` exist.
Every endpoint requires `Authorization: Bearer <operator service credential>`.
The credential is supplied through `RAG_SERVICE_CREDENTIAL` or an explicit factory
argument; no credential is included here. Node derives tenant/store scope before
calling the service. Do not expose these routes through a public reverse proxy.
OpenAPI, Swagger, ReDoc and wildcard CORS are disabled.

The default application has no embedding profile, embedding implementation or
database connection. With a valid credential, health/search/ingest return 503;
without one, they return 401. This is intentional while GAP-03/GAP-04 are open.
Local startup, without changing that unavailable state:

```powershell
python -B -m uvicorn rag_service.app:app --host 127.0.0.1 --port 8000 --no-access-log
```

Bodies must be strict UTF-8 JSON with no duplicate keys, nonfinite values, unknown
fields or unpaired surrogates. Search bodies are limited to 32 KiB, ingest to
8 KiB, responses to 256 KiB. Canonical content is limited to 16,000 Unicode code
points; contiguous zero-overlap chunks are at most 2,000. Nothing is truncated.
The default search deadline is 2 seconds, including body receipt and processing;
a caller's disconnect/cancellation cancels outstanding async work. No retries or
lexical/provider fallback occur. Errors contain bounded codes only, with no raw
query, corpus, exception, path, SQL, or credential. Disable server access logs as
shown above; never add request-body/header logging around this service.

## Integration prerequisites and interfaces

After independent approval resolves GAP-03/GAP-04, Final Integration must supply
`create_app(service=RetrievalService(repository, embedding, profile), ...)` with:

- A profile binding the approved ID, dimension and calibrated cosine floor.
- An embedding adapter implementing `profile_id`, async `ready()` (local
  loadability only; no model call), and async `embed(text)`. No production adapter
  or profile is chosen by this task, and no public test-mode switch exists.
- `PostgresRepository(connection_factory, profile)`. The injected connection
  factory yields an async connection with dictionary rows, `transaction()`,
  `execute(sql, parameters)`, and async cursor `fetchone()`/`fetchall()` (the
  psycopg async protocol). Driver selection/pinning/connection composition and
  secret provisioning remain explicit Integration work; psycopg is not bundled.
- A positive finite `ingest_timeout_seconds`, declared in the deployment runbook
  before ingestion. No ingestion job is enabled without that choice. SQL
  statements have a 1.5-second local timeout; the finite job deadline and
  cancellation bound the enclosing transaction.

Readiness requires the vector extension, both tables, the resolved `vector(D)`
column, no `gap03_profile_unresolved` guard, a loadable matching adapter/profile,
and a restricted database account. It rejects registry mutation privileges,
chunk UPDATE privileges, and privileges on unrelated public tables. Default
GAP-03 migration prevents index writes even if a caller injects configuration.

Ingestion first acquires the same scoped document advisory lock as Node's
registry writer (`JSON.stringify([tenantId,storeId,documentId])`), then a
document/version/profile lock, inside one transaction. Its plain scoped registry
SELECT preserves the Python account's SELECT-only grant; no `FOR SHARE` privilege
exception is needed. Any future Node retirement path must retain that document
lock. Every chunk is validated/embedded before inserts; commit publishes the
complete generation. Failure/cancellation rolls back. Repeated identical complete
generations return `already_indexed`; corrupt/incomplete generations fail closed.

Search joins exact tenant/store/version/profile and active approved
policy/sop/reference rows before an exact cosine scan in Python. It applies the
explicit profile floor, groups document/version by maximum eligible chunk score,
and sorts by score, document ID, then chunk ID; at most three distinct documents
are returned. The work bound is 1,024 filtered chunks; overflow returns 503,
never a partial ranking. There is no ANN index, reranker or nearest-neighbor
answerability shortcut. Node must reconcile all returned metadata/chunk hashes
against its current approved registry before admitting canonical evidence.

## Evidence limitations

`GAP-03 BLOCKED`: no approved model/artifact/revision/dimension/egress profile or
compatible vector deployment. `GAP-04 BLOCKED`: no approved relevance floor or
calibration provenance. Real PostgreSQL/pgvector indexing is unverified and
blocked. `INTEGRATION GAP`: no shared runtime wiring, database driver composition,
service image, Compose, migration registration, or hosted deployment is changed.
No lint/type-check tools were present; tests/imports and syntax compilation were
used locally. No production-readiness, retrieval-quality, or customer-deployment
claim follows from the deterministic tests.
