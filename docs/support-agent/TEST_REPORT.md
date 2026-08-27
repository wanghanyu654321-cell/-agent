# Customer Support Agent Test Report

## Frozen-source evidence

Before extraction, source commit `6026a439cc345969f708a820990dd3fe8d88f0b7` was verified with Customer Support Runtime 36/36, Pi Agent 23/23, Pi SessionManager 100/100, package build, and root `npm run check`. Pi core was not modified.

## Independent repository verification

From this repository root:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run check
```

Result: PASS. Vitest ran 41 tests in 2 files: the complete 36-case V0 runtime suite, one default product-Skills regression, and four extraction-independence tests.

The runtime tests execute the published Pi Agent, tool validation/execution, SessionManager, and Faux provider integration. They cover session recovery, audits, agent/tool budgets, schemas for all four tools, side-effect idempotency and races, timeout cancellation, late events, output guards, empty provider responses, fallback context, and no-write tool exposure.

The extraction tests assert exact Pi dependency pins, local installed ESM entrypoints, no former-monorepo runtime path, and no vendored Pi core source.

## Clean-environment verification

An isolated temporary copy containing no `.git` and no existing `node_modules` was created outside the Pi source tree. It was verified with:

```powershell
npm.cmd ci --ignore-scripts
npm.cmd test
npm.cmd run build
npm.cmd run check
```

Result: PASS. The clean install added 278 packages with no vulnerabilities; tests were 41/41; build and check passed. This is the new-engineer installation evidence for V0.
