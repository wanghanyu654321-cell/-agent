# Real-Source Runtime Proof V1

## Status

`REAL-SOURCE RUNTIME PROOF V1 = IMPLEMENTATION CANDIDATE / PENDING INDEPENDENT REVIEW`.

This successor is a bounded portfolio-runtime proof only. It does not establish
a real customer or merchant deployment, production readiness, Shadow mode,
Assisted mode, autonomous replies, or a release authorization.

## Reused boundaries

The smoke harness composes, without replacing:

- `enterpriseRuntimeModeFromEnv` and `ENTERPRISE_RUNTIME_MODE=pi-real`;
- `ENTERPRISE_KNOWLEDGE_MODE=private`;
- `loadPrivateStoreKnowledgeComposition`;
- `bootstrapPiEnterpriseRuntime` and Pi's public `ModelRuntime` path;
- `createPiEnterpriseRuntimeFactory` and the existing `SupportAgentRuntime`.

It requires a materialized private corpus at the approved opaque scope
`pilot-support-tenant` / `pilot-support-store`. It neither reads nor persists
credentials, creates a direct provider SDK client, copies provider auth, or
alters private-corpus admission, governed evidence routing, Safety, or tools.

## Fixed runtime cases

The runner schedules exactly these three cases once, in order:

| Case | Query | Expected result | Expected authorized evidence |
| --- | --- | --- | --- |
| `A_SINGLE_EVIDENCE` | `商户无法履约` | `answer` via `search_knowledge` | `PB-MT-MERCHANT-CANNOT-FULFILL` |
| `B_ZERO_EVIDENCE` | `UNRELATED_NO_ANSWER_CASE` | `fallback` via `search_knowledge` | none |
| `C_AMBIGUOUS_EVIDENCE` | `过期未消费团购券退款` | `fallback` via `search_knowledge` | none |

The runner compares actual result type, required governed-knowledge lookup, and
authorized evidence IDs. It permits an additional read-only FAQ probe and, for
the ambiguous case, an authority-guarded handoff attempt; it rejects a
successful ticket or handoff outcome. There is no warm-up, fourth case, or
retry loop.

## Operator procedure

After the clean-runner for the exact source commit is green, an operator may
materialize the approved pack into a fresh private directory, then run:

```text
npm run smoke:real-source-runtime
```

The operator must provide existing, Pi-resolvable `PI_PROVIDER` and `PI_MODEL`
configuration together with explicit `pi-real` and private-knowledge modes. The
script does not set, discover, print, or store credentials. If configuration,
authentication, model resolution, materialization, private corpus, or execution
is unavailable, it emits only `REAL_SOURCE_RUNTIME_PROOF_BLOCKED <CATEGORY>`.

For each actual case it may output only source commit, provider, model, case
identity/category, result type, tools called, authorized evidence IDs, elapsed
time, and expected-vs-actual status. It never prints answer text, provider
payloads, raw events, session transcripts, headers, credentials, or reasoning.
