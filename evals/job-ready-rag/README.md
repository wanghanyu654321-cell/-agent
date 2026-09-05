# evals/job-ready-rag — Job-Ready Retrieval Evaluation (Track D)

Deterministic retrieval-evaluation **support** for the Job-Ready sprint, authored
by Track D (`job-ready/eval-delivery-v1`) under the section-10 contract. This
package freezes the population, scores measurements and renders private-data-free
reports. It runs **no** product evaluation and makes **no** overall PASS claim.

## Files

| File | Role |
| --- | --- |
| `schema.ts` | Frozen `RetrievalEvalCase` / `RetrievalMeasurement` / `Scope` / `CorpusEntry` types + fail-closed parsers (verbatim from contract section 10). |
| `corpus.ts` | Governance projections of the 13 approved public-benchmark entries + 6 clearly-marked synthetic isolation fixtures (full ingestable shape). |
| `cases.ts` | The frozen 40 human-authored cases (24 answerable / 8 no-answer / 8 ambiguous) + the `NEGATIVE_CONTROLS` index. |
| `freeze.ts` | Canonical-JSON sha256 population freeze + fail-closed population validation. |
| `metrics.ts` | Deterministic scoring: Recall@3 (stratified), Wrong Evidence Rate + coverage, No-answer Accuracy, latency percentiles, 0/1/2+ routing, scope/status/version violations, failed case IDs, hard safety invariants. |
| `report.ts` | Measurement↔population binding verification + Markdown/JSON reports with the GAP-05 no-PASS banner. |
| `*.test.ts` | Deterministic offline tests (synthetic measurements only; no vector run, no DB). |

## Population

- **40 cases: 24 answerable / 8 no-answer / 8 ambiguous** (within the authorized
  30–50 range).
- **Provenance split:** 32 `human_authored_official_source` (answerable +
  ambiguous) and 8 `synthetic_isolation_fixture` (the no-answer controls).
- **Answerable gold** binds exactly one sufficient approved entry; **ambiguous
  gold** binds at least two distinct admissible plausible approved entries and
  expects no final authorized evidence (routing `2+`); **no-answer gold** is empty.
- Gold `expectedVersions` / `expectedSourceRefs` are derived from the frozen
  corpus, so scoring checks version and source, not IDs alone.
- No real customer transcripts and no invented professional/beauty policy are used
  as factual gold.

## Negative controls (>= 8, all four dimensions)

Eight no-answer synthetic-fixture controls cover: **tenant isolation** (2),
**store isolation** (2), **unapproved evidence** (2: `unapproved` +
`synthetic_test_only`), and **stale/version** (2: `retired`). See
`NEGATIVE_CONTROLS` in `cases.ts`.

## GAP-05 stance (unresolved)

Final numerical retrieval-quality acceptance thresholds and the
calibration/holdout split are **not** independently approved. Therefore this
package selects **no** PASS thresholds and labels **no** overall Job-Ready PASS.
The hard security invariants (zero cross-scope / unapproved / stale-version
admission, zero ordinary authorization on 0/2+) are mandatory and are reported
separately from ranked/quality metrics. Cases are **not** tuned after observing
vector failures.

## Running the deterministic tests

```text
npx vitest --run evals/job-ready-rag
```

These tests are offline and deterministic (`PI_OFFLINE=1`, node environment); they
use synthetic measurements and never call a provider, database or vector index.

## INTEGRATION dependencies (not owned by Track D)

1. **Fixture ingestion.** The 6 synthetic isolation fixtures must be ingested into
   the scoped corpus (Core B / Integration) for the negative controls to be
   meaningful — an entry that is merely absent tests nothing about governance
   exclusion. Track D supplies the fixtures in ingestable `KnowledgeEntry` shape;
   it does not write to `knowledge/**`.
2. **Authorized runs.** Producing real `RetrievalMeasurement` records requires a
   separately authorized retrieval run. Vector mode additionally requires an
   approved **GAP-03** embedding profile and compatible pgvector build; **GAP-04**
   governs the relevance floor. Lexical FIRST results are preserved separately
   from later vector results.
3. **Wiring.** Report/evidence artifacts are linked into the combined truthful
   evidence by Final Integration (`README.md`, `docs/job-ready/CURRENT_STATE.md`),
   not by this package.
