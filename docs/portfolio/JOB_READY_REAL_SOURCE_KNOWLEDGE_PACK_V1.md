# Job-Ready Real-Source Knowledge Pack V1

## Status

`JOB-READY REAL-SOURCE KNOWLEDGE PACK V1 = IMPLEMENTATION CANDIDATE`.

The pack is a small, source-traceable Customer Support portfolio successor. It
does not constitute a real merchant policy, customer deployment, Shadow mode,
or Assisted mode.

## Source and selection

The committed selector reads the already-governed public official corpus at
`knowledge/public-benchmark/approved/meituan-local-services-2026.json`. It
selects exactly these approved source IDs:

- `PB-MT-VOUCHER-USE`
- `PB-MT-CHANGE-REFUND`
- `PB-MT-MERCHANT-CANNOT-FULFILL`
- `PB-MT-AFTERSALES-CONTACT`
- `PB-MT-REFUND-ORIGINAL-PAYMENT`
- `PB-MT-UNCONSUMED-REFUND`
- `PB-MT-EXPIRED-AUTO-REFUND`
- `PB-DP-HELP-UNVERIFIED`

The scoped copy preserves each selected entry's factual `content`, `version`,
and official `sourceRef`. It excludes the three restaurant-specific fulfillment
entries and both scope probes.

## Operator preparation

The generated runtime corpus is deliberately not committed. An operator with an
empty private directory can materialize it locally:

```text
SUPPORT_AGENT_PRIVATE_KNOWLEDGE_DIR=<operator-private-directory>
node --experimental-transform-types scripts/materialize-real-source-pilot-pack.ts
```

The command writes one file once, using opaque portfolio scope
`pilot-support-tenant` / `pilot-support-store`. It neither reads provider
credentials nor starts the Enterprise HTTP application. The existing private
composition then enforces one scope, `approved` status, and both synthetic
admission controls set to false.

## Routing and cases

The sole FAQ entry remains on `search_faq`; the seven non-FAQ entries use the
existing governed `search_knowledge` path. No FAQ duplication, retrieval
algorithm change, synchronous semantic-selector call, or portfolio/demo
fallback is introduced.

[case-manifest.json](../../knowledge/pilot-real-source-v1/case-manifest.json)
contains thirteen explicitly labelled `HUMAN_AUTHORED_TEST_CASE` scenarios.
They are evaluation cases, not real customer conversations. The pack covers the
eight selected facts, three no-answer cases, one ambiguity fail-closed case, and
one scope-isolation case.

## Limits

No real merchant content, customer data, real-provider plus real-source smoke,
or Pilot operation is included. After independent clean-runner evidence, any
manual real-provider smoke remains capped at three attempts and records only
safe metadata.
