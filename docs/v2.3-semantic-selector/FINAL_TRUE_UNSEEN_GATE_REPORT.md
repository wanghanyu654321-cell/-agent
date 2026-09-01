# V2.3.1 Final True Unseen Semantic Gate Report

## Verdict

**V2.3.1 FINAL TRUE UNSEEN SEMANTIC GATE: INFRASTRUCTURE BLOCKED.**

This is not a semantic PASS or FAIL. The authorized first-exposure attempt
recorded a timeout before the frozen 24-call population was complete. The
durable journal and its derived machine report are immutable evidence; no
missing result is inferred, no call is retried, and no second attempt is
created.

Runtime Integration, merge, release, and a V2.3 tag remain **NOT AUTHORIZED**.

## Frozen identity and provenance

| Field | Value |
| --- | --- |
| Attempt ID | `v2.3.1-final-true-unseen-first-exposure` |
| Evaluation source commit | `780735bf43f049f111467dcaf14c4a3d43733d41` |
| Holdout frozen commit | `001ee12fb2f04c335f75a05f6b54546c89fe5cc9` |
| Provider/model | `openai-codex` / `gpt-5.6-sol` |
| Prompt version/SHA-256 | `v2.3.1` / `fabf617ce6ecd9cc4f91cd68e42c789f1c0be629297e046a3c782fe6bfe29869` |
| Evidence SHA-256 | `7a17e6496da4d4e0019781d2f2ec624b660cf445bc5a174b599e5a17be7bf01d` |
| Cases SHA-256 | `9e7ada4c9117c575dd265c81223e7b1f229305fd704686f19cee09f30ab9b118` |
| Evaluation timeout | `15000ms` |
| Expected calls | `24` |

The durable attempt manifest was written before the first model call and binds
the exact evaluation source commit above.

## Durable execution evidence

The immutable machine report is
[`final-v2-3-1-true-unseen-run.json`](../../evals/selection/semantic/reports/final-v2-3-1-true-unseen-run.json).
The JSONL journal has `20` valid, unique, newline-terminated records with exact
contiguous sequence range `1..20`; it has no incomplete trailing line.

At `final-v2.3.1-10/reversed` (sequence `20`), the provider invocation
persisted `outcome = timeout` and `elapsedMs = 15000`. The runner then stopped
the attempt as required. The four remaining identities were never executed:

- `final-v2.3.1-11/primary`
- `final-v2.3.1-11/reversed`
- `final-v2.3.1-12/primary`
- `final-v2.3.1-12/reversed`

Because the journal is incomplete and contains a timeout, the frozen exact
semantic Gate cannot pass. The partial results are diagnostic only:

| Segment | Primary | Reversed |
| --- | --- | --- |
| Clear direct answer | `4 correct`, `0 wrong`, `0 abstain` | `4 correct`, `0 wrong`, `0 abstain` |
| True insufficiency | `4 abstain`, `0 unsupported selection` | `4 abstain`, `0 unsupported selection` |
| Hard related insufficiency | `2 abstain`, `0 unsupported selection` | `1 abstain`, `0 unsupported selection`; later trace timed out |

No complete 24-call aggregate metric, semantic accuracy, or PASS/FAIL result is
claimed from these partial traces.

## Guardrails preserved

- No completed `caseId + order` identity was replayed.
- No second attempt was created.
- No prompt, selector, gold, holdout, provider/model, threshold, or runtime
  change occurred after exposure.
- No Runtime Integration, tag, merge, or release occurred.
- Pi package pins remain exactly `0.84.3`.

## Post-attempt offline verification

After evidence and documentation were recorded, the repository ran:

```text
npm test
npm run build
npm run check
npm run integrity
```

The results are recorded with this evidence checkpoint. These offline checks do
not convert the incomplete timeout-contaminated attempt into a semantic result.

CUSTOMER SUPPORT AGENT V2.3.1

FINAL TRUE UNSEEN SEMANTIC GATE INFRASTRUCTURE BLOCKED

GATE EVIDENCE PRESERVED

RUNTIME INTEGRATION NOT AUTHORIZED

MERGE NOT AUTHORIZED

RELEASE NOT AUTHORIZED
