# V2.1 Benchmark Corpus Report

## Corpus status

- `PUBLIC_OFFICIAL_AUTHORITY` source documents: `4`
- Governed factual benchmark records: `11`
- Source-backed scope-probe records: `2`
- Private store corpus loaded: `no`
- Customer data retained: `no`

The public corpus is [`knowledge/public-benchmark/approved/meituan-local-services-2026.json`](../../knowledge/public-benchmark/approved/meituan-local-services-2026.json). Each factual record is `approved` only for the bounded public benchmark and has a stable evidence ID, version, source reference, tenant/store scope, and approved content. This is not evidence that a particular beauty-service store follows the same policy.

## Evidence and query roles

- `PUBLIC_OFFICIAL_AUTHORITY` is the only factual authority. Its material is normalized into atomic benchmark facts with cited source references.
- `PUBLIC_REAL_CASE` is only a de-identified customer query/scenario source. It supplies no factual answer, policy, or approval.
- `SYNTHETIC_QUERY` is only controlled query augmentation. It cannot authorize a fact or become admitted evidence.

Full source pages and any future private corpus remain outside the repository. The repository contains only the minimal atomic evidence required to reproduce the benchmark.
