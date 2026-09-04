# Pilot Private Store Knowledge Composition V1

## Status

`PRIVATE STORE KNOWLEDGE COMPOSITION V1 = IMPLEMENTATION CANDIDATE`.

This is a bounded successor to the approved Real Pi Provider Adapter. It
composes an operator-supplied private corpus with the existing product Runtime;
it does not approve a real customer/store Pilot, automatic customer replies, or
any new retrieval architecture.

## Modes and startup boundary

`ENTERPRISE_KNOWLEDGE_MODE` defaults to `portfolio`, preserving the approved
deterministic portfolio path and its synthetic provider-adapter smoke.

`private` is permitted only with `ENTERPRISE_RUNTIME_MODE=pi-real` and requires
`SUPPORT_AGENT_PRIVATE_KNOWLEDGE_DIR`. Its corpus is loaded and admitted before
Pi startup can compose the Enterprise application, so missing, unreadable,
invalid, or empty input fails closed before an HTTP listener opens. A failed
private load never falls back to portfolio fixtures.

## Pilot corpus admission

The private mode reuses the existing `KnowledgeEntry` loader and validation. It
adds only this composition-level admission rule:

- the corpus contains at least one entry;
- every entry is `approved`;
- every entry has an explicit tenant and store scope; and
- all entries resolve to one identical tenant/store pair.

Both synthetic-admission controls are false in this path. Consequently,
`synthetic_test_only`, unapproved, unscoped, and mixed-scope entries are
rejected. Existing identity, kind, version, update-time, source-reference, and
tag validation stays owned by the established loader.

## Tool composition

Private `faq` entries are adapted only for `search_faq`:

- `title` becomes the question;
- `content` becomes the answer; and
- id, status, version, source reference, tenant scope, and store scope are
  preserved.

Private `policy`, `sop`, and `reference` entries alone enter the existing
`GovernedKnowledgeRetrievalService` and `search_knowledge` path. FAQ entries
are not duplicated into retrieval. The existing zero/single/multiple admitted
evidence behavior, Safety precedence, four tool contracts, and server-derived
tenant/store authority are unchanged.

## Data and Pilot limits

This repository contains no real merchant policy, pricing, hours, safety
procedure, customer record, or other store fact for this mode. Tests create
opaque temporary filesystem fixtures only; they are not merchant knowledge.
No real-provider plus private-corpus smoke, customer/store Pilot, Shadow mode,
or Assisted mode is authorized by this candidate.
