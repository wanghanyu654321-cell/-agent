# V1 Safety Gate Report

## Baseline protection

- `customer-support-agent-runtime-v0` resolves to `72eadc11a47e4176887607a310e74c242d4a261a`.
- V1 work is on `feat/v1-safety-vertical-slice`; the V0 tag was not moved.
- The frozen Pi evidence checkout remains at `6026a439cc345969f708a820990dd3fe8d88f0b7` with a clean working tree.
- Pi remains three exact npm dependencies at `0.84.3`; no Pi source, second runtime, second Agent loop, or copied generic Pi package is present.

## Safety boundary evidence

- `src/safety.ts` owns the minimal risk/evidence/disposition contract and `ApprovedSafetyRetrievalService`, which implements the existing `RetrievalService` and checks `AbortSignal`.
- Production retrieval admits only `status: approved`; `synthetic_test_only` is rejected unless an explicit test-only option is passed. `knowledge/safety/approved/` is intentionally empty.
- Missing, partial, unapproved, or synthetic production evidence deterministically produces `escalate`, a pause message, and the existing idempotent `handoff_to_human` storage path.
- Supported customer text is constructed only from returned approved options (at most three). Tests demonstrate that an unsafe model completion and synthetic evidence cannot leak into the result.
- The existing `support-agent.audit` record now includes observable safety risk, retrieval query, evidence IDs/status, disposition, tool result, handoff result, and guard reason; it does not store provider completion text or hidden reasoning.

## Verification results

Local commands:

```text
npm.cmd test                 PASS — 54/54 (V0 41/41 retained; V1 adds 13)
npm.cmd run build            PASS
npm.cmd run check            PASS
npm.cmd run eval:safety      PASS — 30/30
```

Eval metrics: Safety Detection Recall 100%; Escalation Precision 100%; Escalation Recall 100%; Grounded Answer Rate 100%; Tool Success Rate 100%; Required Escalation Recall 100%; Unsupported Professional Claim Rate 0.

Fresh temporary directory `C:\Users\why的私密花园\AppData\Local\Temp\customer-support-agent-v1-gate-41208f1a-50fe-4f74-9f2c-1f8f949e82b2`:

```text
npm.cmd ci --ignore-scripts  PASS — 278 packages, 0 vulnerabilities
npm.cmd test                 PASS — 54/54
npm.cmd run build            PASS
npm.cmd run check            PASS
npm.cmd run eval:safety      PASS — 30/30
```

## Gate result

All V1 acceptance items are satisfied for the controlled V1 safety slice. The deliberate limitation is unchanged: no real professional safety corpus, production RAG infrastructure, or external qualified-human endpoint is supplied. Therefore real detected professional risk remains pause-and-escalate until an approved corpus and downstream workflow are provided.
