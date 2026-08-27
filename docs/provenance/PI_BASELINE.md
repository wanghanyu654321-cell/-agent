# Pi Baseline Provenance

- Pi repository: `https://github.com/earendil-works/pi.git`
- PI_UPSTREAM_COMMIT: `1defa151e0c1dac87d38a2d0ac09d67f817b30f9`
- SOURCE_V0_COMMIT: `6026a439cc345969f708a820990dd3fe8d88f0b7`

The upstream baseline is the exact parent of the first Customer Support commit, established with `git rev-parse 993a7be^` in the frozen Pi repository.

## Frozen Customer Support V0 commits

1. `993a7be` — `feat(agent): add customer support runtime`
2. `666e47b` — `fix(agent): harden support runtime gates`
3. `699646e` — `test(agent): cover all support tool schemas`
4. `6026a43` — `fix(agent): harden independent runtime gates`

## Consumed Pi capabilities

- `@earendil-works/pi-agent-core`: Agent loop, AgentEvent, AgentTool, and StreamFn.
- `@earendil-works/pi-ai`: model and assistant-message contracts plus deterministic Faux provider test support.
- `@earendil-works/pi-coding-agent`: public `convertToLlm`, `SessionManager`, `loadSkillsFromDir`, and `formatSkillsForPrompt` exports.

Pi core was not modified by the V0 commits or by this extraction. The frozen Pi worktree is retained as read-only evidence; this repository does not vendor Pi source.
