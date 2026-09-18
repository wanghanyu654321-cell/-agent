# V2.1.1 Evaluation Integrity Gate Report

## Scope

V2.1.1 is an evaluation-integrity-only patch above frozen V2.1 commit `9a7872004399ad55b8bd5dbeaffc073b68f0c641`. It preserves the V2.1 tag, FIRST machine report, public corpus, retrieval ranking, Pi dependency pins, and product runtime architecture.

## Local candidate gates

| Gate | Result |
| --- | --- |
| Independent runtime metrics | PASS — no constants or shared `passRate` aliases remain. |
| Negative controls | PASS — unsupported fact, audit divergence, wrong version, wrong source reference, and no-evidence factual answer each detect failure. |
| Precision measurement | PASS — evidence precision and extraneous-evidence rate are separately reported. |
| Frozen ranking evidence | PASS — `public-24` and `public-30` remain unchanged; Top-1 96%, Recall@3 100%. |
| FAQ exposure | Delegated — V2.0.1 production FAQ admission remains covered by `npm run eval:knowledge`; no duplicate public-evaluator implementation. |
| Historical reports | PASS — `first-run.json` and V2.1 `public-real-world-final.json` are preserved; V2.1.1 writes `public-real-world-v2.1.1-final.json`. |

## Release rule

The exact final commit must pass the complete clean-clone command set and the GitHub Actions clean-runner Gate before creating `customer-support-agent-v2.1.1-eval-integrity`.
