# Retrieval Evaluation Evidence — TEMPLATE (Track D)

Fill this in **only** after an independently authorized retrieval run against the
frozen population. This template records evidence; it does **not** itself run any
product evaluation. Copy to a dated file (for example
`retrieval-eval-<mode>-<sourceCommit>.md`) and complete every field.

> **CONTRACT GAP-05 (unresolved).** Final numerical retrieval-quality acceptance
> thresholds and the calibration/holdout split are not independently approved.
> **No measured percentage recorded here may be labelled an overall Job-Ready
> PASS.** Hard scope/status/version/authorization safety invariants remain
> mandatory and are reported separately below.

## 1. Run identity

| Field | Value |
| --- | --- |
| `sourceCommit` | `<commit-sha>` |
| Retrieval `mode` | `lexical` \| `vector` |
| `embeddingProfileId` (vector only; GAP-03) | `<profile-id or N/A>` |
| Run authorization (who/when) | `<approver / date>` |
| Runner environment | `<host / container id>` |

## 2. Frozen population binding

| Field | Value |
| --- | --- |
| `casesSha256` | `<64-hex>` |
| `corpusSha256` | `<64-hex>` |
| Population split | 24 answerable / 8 no-answer / 8 ambiguous |
| Negative controls | `<count>` across tenant / store / approval / version |
| All measurements bound to frozen hashes? | yes / **NO** |

Lexical FIRST results are preserved separately from any later vector results;
one report covers one mode.

## 3. Hard safety invariants (mandatory — must all be zero)

| Invariant | Count | Violating case IDs |
| --- | --- | --- |
| Cross-scope admissions | `<n>` | `<ids>` |
| Unapproved admissions | `<n>` | `<ids>` |
| Stale-version admissions | `<n>` | `<ids>` |
| Unknown admissions | `<n>` | `<ids>` |
| Ordinary authorization on 0/2+ | `<n>` | `<ids>` |

Invariant status: **HOLD** / **VIOLATED**.

## 4. Ranked / quality metrics (reported, NOT thresholded — GAP-05)

| Metric | Value |
| --- | --- |
| Recall@3 — answerable stratum | `<x>` over `<n>` cases |
| Recall@3 — ambiguous stratum | `<x>` over `<n>` cases |
| Wrong Evidence Rate | `<x>` (`<wrong>` / `<returned distinct>`); `0/0` reported as N/A |
| Coverage (cases with >=1 returned distinct) | `<x>` |
| No-answer Accuracy | `<x>` (`<correct>` / `<total>`) |
| Routing accuracy 0/1/2+ | `<x>` (bucket 0 `<c/e>`, 1 `<c/e>`, 2+ `<c/e>`) |
| Retrieval latency min / P50 / P95 / max | `<a>` / `<b>` / `<c>` / `<d>` ms over `<count>` |
| Latency timeouts / errors (separate) | `<t>` / `<e>` |
| Dependency failures | `<n>` |

## 5. Failed cases

| Field | Value |
| --- | --- |
| Passed / total | `<p>` / `<total>` |
| Failed case IDs | `<comma-separated ids or (none)>` |

## 6. Private-data-free attestation

- [ ] No corpus prose, credentials, raw customer transcripts, hidden reasoning or
      provider payloads are embedded in this evidence or its linked report.
- [ ] Only safe fields (case IDs, entry IDs, hashes, counts, latencies) are shown.

## 7. Reproduction

Track D ships the deterministic freeze / scoring / report **support library**
(`evals/job-ready-rag/{schema,corpus,cases,freeze,metrics,report}.ts`), not a
product runner. Producing real measurements requires a separately authorized
retrieval run (and, for vector mode, an approved GAP-03 profile) that emits
`RetrievalMeasurement` records bound to the frozen `casesSha256`/`corpusSha256`.

```text
# Frozen-population integrity + deterministic scoring/report tests (offline, no external calls):
npx vitest --run evals/job-ready-rag

# Recompute the frozen digests to bind a run:
#   freezePopulation() -> { casesSha256, corpusSha256, ... }
# Score an authorized measurement set (single mode):
#   buildReport(measurements) -> renderReportMarkdown / renderReportJson
```

Link the generated report artifact (JSON + Markdown) here: `<path>`.
