# Independent GitHub Actions Gate

The workflow is [customer-support-agent-gate.yml](../../.github/workflows/customer-support-agent-gate.yml). It runs on every pull request and on pushes to `main` and `feat/v1.2-blind-eval-ci` from an Ubuntu clean runner with Node `22.19.0`.

The workflow performs, in order:

1. full checkout including tags;
2. Node version verification;
3. `npm ci --ignore-scripts`;
4. `node scripts/verify-integrity.mjs`;
5. `npm test`;
6. `npm run build`;
7. `npm run check`;
8. `npm run eval:safety`;
9. `npm run eval:safety:robustness`;
10. `npm run eval:safety:holdout`.

No Gate command uses `continue-on-error`. Evaluation JSON artifacts are uploaded after execution for inspection only; they cannot turn a failed test, build, check, integrity command, or evaluation into a passing workflow.

The integrity script checks the exact peeled V0, V1, and V1.1 tags; exact Pi dependency pins; the single runtime/Agent-construction boundary; no vendored Pi core class under `src`; and no customer-facing file, shell, or knowledge-writing tool declaration.
