# docs/job-ready/evidence — Evidence Templates (Track D)

Isolated evidence **templates** authored by Track D (`job-ready/eval-delivery-v1`).
They are empty scaffolds: filled copies are produced only after independently
authorized runs/deployments. Track D does not claim any result here.

| Template | Use |
| --- | --- |
| `retrieval-eval-evidence-template.md` | Record one authorized retrieval-eval run bound to the frozen population hashes. Carries the GAP-05 no-PASS banner. |
| `deployment-evidence-template.md` | Record deployment evidence across the five distinguished levels (local Docker, hosted TLS, DB restart persistence, index readiness, real channel/provider). |

## Rules

- **No secrets, no private data.** Templates and any filled copy exclude
  credentials, raw corpus content, customer PII, hidden reasoning and provider
  payloads; only safe structured fields are recorded.
- **BLOCKED, not PASS.** Missing environment/dependency is recorded as BLOCKED.
- **GAP-05.** No measured percentage is labelled an overall Job-Ready PASS.
- **Ownership.** Final Integration owns the combined truthful evidence links in
  `README.md` and `docs/job-ready/CURRENT_STATE.md`, and only after validation.
  These templates do not modify those files.
