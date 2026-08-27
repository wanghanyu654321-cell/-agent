# Pi Integration

Customer Support Agent depends on published Pi packages at exact `0.84.3` versions. The lockfile resolves those package versions for reproducible installation. No dependency points at Pi `main`, a floating tag, a workspace, or a Git branch.

| Pi package | Pin | Public API used | Why required | Upgrade strategy |
| --- | --- | --- | --- | --- |
| `@earendil-works/pi-agent-core` | `0.84.3` | `Agent`, `AgentTool`, `AgentEvent`, `StreamFn` | Generic agent execution and strict tool lifecycle | Upgrade as a deliberate product change after running the full runtime and clean-environment suite. |
| `@earendil-works/pi-ai` | `0.84.3` | `Model`, `AssistantMessage`, `compat` Faux provider | Pi model contract and deterministic provider tests | Pin a reviewed compatible release; do not float to latest. |
| `@earendil-works/pi-coding-agent` | `0.84.3` | `convertToLlm`, `SessionManager`, `loadSkillsFromDir`, `formatSkillsForPrompt` | Pi JSONL sessions and Skills integration without internal imports | Verify public API compatibility and the full Gate before changing the pin. |

The product has one Pi Agent loop. It does not copy or reimplement Pi agent execution, SessionManager, model/provider code, generic tool runtime, or Skills loader. Pi source may be checked out at the exact provenance commit for reference only and must never be committed here.
