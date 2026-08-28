# V1.2 Source Audit

## Frozen baseline

- V0 peel: `72eadc11a47e4176887607a310e74c242d4a261a`.
- V1 peel: `9c60fe9a0764bd22a595d13a463b5665899d7c35`.
- V1.1 peel: `16fbf073f096e8eda443ddcad79e3666aec5ec09`.
- V1.2 branch begins at V1.1 commit `16fbf073f096e8eda443ddcad79e3666aec5ec09`.
- `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, and `@earendil-works/pi-coding-agent` are all exactly `0.84.3` in both manifest and lockfile root metadata.

## Existing runtime and evaluation boundaries

- `src/index.ts` contains the only `SupportAgentRuntime`; it owns the existing primary and fallback Pi Agent construction, tool execution, session persistence, audit, and idempotent handoff state.
- `src/safety.ts` owns deterministic safety detection, approved-only retrieval, decision policy, and the pure unsupported-claim inspector.
- `evals/safety/robustness/runner.ts` is the development regression evaluator. It already executes real runtime instances, actual Pi Agent tool events, persisted audit, and handoff state for its 100 known cases.
- V1.2 will add a separate holdout corpus and evaluator under `evals/safety/holdout/`. It will not replace or tune the V1.1 corpus.

## Baseline checks and environmental finding

- `npm ci --ignore-scripts`, `npm test` (72/72), and `npm run build` passed in the V1.2 worktree.
- The initial `npm run check` failed only because a fresh Windows worktree with `core.autocrlf=true` checked out all existing LF blobs as CRLF and Biome enforces LF. The source blobs and the original V1.1 checkout are LF; no source-content diff existed.
- V1.2 adds `.gitattributes` with `* text=auto eol=lf` so fresh worktrees and clean CI runners use the repository's canonical line endings. This is an environment-reproducibility correction, not a runtime behavior change.

## Architecture scan

- No vendored Pi Agent, SessionManager, model, or tool-registry source was found.
- No `workspace:*` dependency, Pi monorepo relative import, or customer-facing filesystem/shell/knowledge-writing tool was found.
- The existing fallback Agent is part of the single runtime's failure path; no second generic runtime or Agent loop is introduced by V1.2.
