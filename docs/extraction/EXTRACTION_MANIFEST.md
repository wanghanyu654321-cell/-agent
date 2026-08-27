# Extraction Manifest

Source range: `993a7be^` (`1defa151e0c1dac87d38a2d0ac09d67f817b30f9`) through `6026a439cc345969f708a820990dd3fe8d88f0b7` in `earendil-works/pi`.

| Source path | Target path | Class | Action | Reason |
| --- | --- | --- | --- | --- |
| `.pi/skills/appointment/SKILL.md` | `skills/appointment/SKILL.md` | D | COPY | Product appointment SOP. |
| `.pi/skills/complaint/SKILL.md` | `skills/complaint/SKILL.md` | D | COPY | Product complaint SOP. |
| `.pi/skills/escalation/SKILL.md` | `skills/escalation/SKILL.md` | D | COPY | Product escalation SOP. |
| `.pi/skills/greeting/SKILL.md` | `skills/greeting/SKILL.md` | D | COPY | Product greeting SOP. |
| `.pi/skills/refund/SKILL.md` | `skills/refund/SKILL.md` | D | COPY | Product refund SOP. |
| `docs/support-agent/ARCHITECTURE.md` | `docs/support-agent/ARCHITECTURE.md` | C | RECREATE | Updated from Pi-package wording to independent product architecture. |
| `docs/support-agent/CURRENT_STATE.md` | `docs/support-agent/CURRENT_STATE.md` | C | RECREATE | Names the independent repository as V0 source of truth. |
| `docs/support-agent/INDEPENDENT_GATE_REVIEW.md` | `docs/support-agent/INDEPENDENT_GATE_REVIEW.md` | C | RECREATE | Records independent-package evidence. |
| `docs/support-agent/PI_SOURCE_AUDIT.md` | `docs/support-agent/PI_SOURCE_AUDIT.md` | C | COPY | Historical V0 source-audit evidence. |
| `docs/support-agent/TEST_REPORT.md` | `docs/support-agent/TEST_REPORT.md` | C | RECREATE | Adds independent and clean-install evidence. |
| `package-lock.json` | `package-lock.json` | E | RECREATE | Pi monorepo lockfile was replaced with an independent lockfile. |
| `packages/customer-support-agent/package.json` | `package.json` | E | RECREATE | Removes workspace packaging and pins public Pi dependencies. |
| `packages/customer-support-agent/src/index.ts` | `src/index.ts` | A | RECREATE | Preserves V0 runtime while replacing internal Pi imports and product Skills root. |
| `packages/customer-support-agent/test/support-agent-runtime.test.ts` | `tests/support-agent-runtime.test.ts` | B | RECREATE | Preserves 36 V0 cases and uses public Pi SessionManager export. |
| `packages/customer-support-agent/tsconfig.json` | `tsconfig.json` | E | RECREATE | Removes Pi-root tsconfig inheritance. |
| `packages/customer-support-agent/vitest.config.ts` | `vitest.config.ts` | E | RECREATE | Removes Pi-root Vitest merge and source aliases. |

Target-only files `biome.json`, `.gitignore`, and `tests/extraction-independence.test.ts` are independent-repository configuration and extraction regression evidence. No F-class Pi upstream source is copied. No E-class monorepo integration file was copied unchanged.
