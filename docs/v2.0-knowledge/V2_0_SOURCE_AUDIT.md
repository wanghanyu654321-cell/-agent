# V2.0 Source Audit

## Frozen input

- Working branch: `feat/v2.0-knowledge-grounding`.
- V2.0 starts from `customer-support-agent-v1.2-validation^{}` = `932cdf5543f996c63157c00750cdb597d0f547bd`.
- Historical peeled tags were read before modification:
  - V0: `72eadc11a47e4176887607a310e74c242d4a261a`
  - V1: `9c60fe9a0764bd22a595d13a463b5665899d7c35`
  - V1.1: `16fbf073f096e8eda443ddcad79e3666aec5ec09`
  - V1.2: `932cdf5543f996c63157c00750cdb597d0f547bd`
- GitHub Actions run [33141675118](https://github.com/wanghanyu654321-cell/-agent/actions/runs/33141675118) completed successfully for V1.2 commit `932cdf5543f996c63157c00750cdb597d0f547bd`.
- All three Pi runtime dependencies are pinned exactly to `0.84.3` in `package.json` and the lockfile root.

## Baseline verification

| Command | Result |
| --- | --- |
| `npm ci --ignore-scripts --no-audit` | PASS in the isolated V2.0 worktree |
| `npm test` | PASS — 12 files, 102 tests |
| `npm run build` | PASS |
| `npm run check` | PASS |
| `node scripts/verify-integrity.mjs` | PASS |

The first isolated install was interrupted by the sandbox while fetching declared packages, leaving missing local executables. Re-running the same lockfile install with the required network permission repaired the installation; this was an environment issue, not a baseline code failure.

## Existing primitives reused by V2.0

- `SupportAgentRuntime` in `src/index.ts` remains the only product runtime and owns the Pi Agent calls, session persistence, audit entry, limits, cancellation, and the four business tools.
- `RetrievalService` remains the product retrieval boundary. Its current `RetrievalEvidence` is too weak for general business facts: it only carries `id`, `text`, and optional safety evidence.
- `search_faq` and `search_knowledge` are preserved. In V1.2, either a matching inline FAQ or any general retrieval item sets `verifiedKnowledgeEvidence`; V2.0 must restrict that transition to admissible governed evidence.
- `SupportResult` currently does not expose structured general evidence, and `support-agent.audit` only records specialized safety evidence. V2.0 will add minimal general grounding metadata to both.
- `src/safety.ts` and `ApprovedSafetyRetrievalService` retain their stronger specialized safety decision boundary. V2.0 must not coerce safety data into a weaker generic form.
- The V1.1 100-case runtime evaluation and V1.2 60-case holdout use the real runtime, Pi Agent tool events, audit persistence, and existing handoff store. They remain untouched regression assets.

## Integrity and boundary findings

- There is exactly one `SupportAgentRuntime` and Pi Agent construction remains in `src/index.ts` only (primary plus provider-fallback invocation).
- The four existing product tools are `search_faq`, `search_knowledge`, `create_ticket`, and `handoff_to_human`.
- No customer-facing file, shell, or knowledge-writing tool is declared.
- The integrity script scans `src/` for vendored Pi `Agent`, `SessionManager`, and `ToolRegistry` implementations; it passed.
- No workspace dependency, source-relative Pi import, or Pi core vendor directory is present.

## V2.0 implementation decision

V2.0 will add a product-owned governed knowledge contract and deterministic file-backed retrieval beneath the existing boundary. Only `approved` entries may authorize factual customer answers in production. Controlled fixtures will be explicitly marked `synthetic_test_only`; no real production knowledge entry is created by this task.
