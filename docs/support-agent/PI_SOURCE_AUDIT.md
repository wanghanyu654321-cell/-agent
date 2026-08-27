# Historical Pi Source Audit

This document is frozen evidence from the original Pi workspace. It describes the source-side integration before extraction and is not the current product layout. The independent repository integration is documented in `docs/architecture/PI_INTEGRATION.md`.

## Source examined

- Repository: `https://github.com/earendil-works/pi.git`
- Commit: `1defa151e0c1dac87d38a2d0ac09d67f817b30f9` (`main`)
- Root runtime: Node `>=22.19.0`; checked locally with Node `v24.18.0`.
- Relevant workspace packages: `@earendil-works/pi-agent-core` and `@earendil-works/pi-coding-agent`, both `0.84.3`.

The Phase 0 files named by the implementation contract were read before customer-support production code was added: agent loop, Agent, Agent core types, Agent README, AgentSession, SessionManager, SDK, extension, skills, session-format documents, and all SDK examples.

## Reused Pi primitives

| Requirement | Actual Pi primitive | Integration use |
| --- | --- | --- |
| Agent execution | `Agent` and `agentLoop` from `@earendil-works/pi-agent-core` | `SupportAgentRuntime` creates a Pi Agent; it does not implement an LLM loop. |
| Tool schema validation | `AgentTool` plus Pi's `validateToolArguments` path | All four business tools use TypeBox schemas with `additionalProperties: false`; invalid calls reach Pi as errors. |
| Authorization gate | `Agent.beforeToolCall` | Runtime receives Pi-validated args and checks tool budget, side-effect permissions, ticket reservation/idempotency, and one-per-conversation handoff reservation before Pi invokes a tool. |
| Sequential side effects | `AgentTool.executionMode = "sequential"` and `toolExecution = "sequential"` | `create_ticket` and `handoff_to_human` cannot run concurrently. |
| Lifecycle and audit | `AgentEvent` subscription and `SessionManager.appendCustomEntry` | Runtime records tool/turn/message events, appends standard messages, persists a `support-agent.audit` custom entry, and unsubscribes persistence listeners when a deadline returns before an uncooperative provider settles. |
| Session format | `SessionManager.create`, `SessionManager.open`, `buildSessionContext`, and `SessionManager` JSONL | Business conversation mapping stores Pi session identity and session-file reference; a new runtime reopens the existing Pi JSONL and supplies its resolved message context to Pi without replacing the format. |
| Skills | `loadSkillsFromDir` and `formatSkillsForPrompt` | Skill metadata is always available; matched SOP body is server-loaded on demand without exposing file tools. |
| Provider abstraction | Pi `StreamFn` / model contract | The runtime uses the provided Pi stream function, primary model, and one fallback only after a primary provider error. |

## Boundary decision

The customer-support package is `packages/customer-support-agent/`, not `apps/`, because this Pi checkout's root workspace already includes `packages/*` and has no `apps/*` workspace. This avoids adding a workspace abstraction/configuration that V1 does not need.

No Pi core source file is modified by this integration.
