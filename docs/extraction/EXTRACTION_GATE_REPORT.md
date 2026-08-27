# Extraction Gate Report

## Commands and results

```powershell
# frozen Pi source, read only
git -c safe.directory='D:/Desktop/工作agent/pi' -C 'D:\Desktop\工作agent\pi' status --short
git -c safe.directory='D:/Desktop/工作agent/pi' -C 'D:\Desktop\工作agent\pi' rev-parse 993a7be^

# independent repository
npm.cmd test
npm.cmd run build
npm.cmd run check

# clean temporary repository-equivalent copy with no .git or node_modules
npm.cmd ci --ignore-scripts
npm.cmd test
npm.cmd run build
npm.cmd run check
```

Results: frozen source worktree clean; upstream parent `1defa151e0c1dac87d38a2d0ac09d67f817b30f9`; independent tests 41/41; independent build PASS; independent check PASS; clean install PASS with 278 packages; clean tests 41/41; clean build PASS; clean check PASS.

## Acceptance Gate

| Gate | Result | Evidence |
| --- | --- | --- |
| Frozen Pi source unchanged and recoverable | PASS | Read-only Phase 0 status, source commit, branch, and tag checks. |
| Exact Pi baseline and complete extraction classification | PASS | `docs/provenance/PI_BASELINE.md` and `EXTRACTION_MANIFEST.md`. |
| Product files migrated; no Pi core vendoring or workspace leakage | PASS | public-package imports and four extraction-independence tests. |
| Pinned Pi dependency strategy | PASS | exact `0.84.3` package pins and lockfile. |
| V0 runtime guarantees and all four tools | PASS | 37 runtime tests including the full frozen 36-case suite. |
| Clean install, independent tests, build, and check | PASS | isolated temporary-copy execution above. |
| Documentation matches independent implementation | PASS | architecture, integration, provenance, current state, test, and review documents updated. |

Extraction Gate status: PASS.
