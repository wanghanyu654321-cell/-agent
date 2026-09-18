# Real Pi Provider Adapter Directive

## Status

`REAL PI PROVIDER ADAPTER = IMPLEMENTATION CANDIDATE`.

This is a bounded provider-composition successor to the approved local Docker
delivery proof. It is neither a real-store knowledge Pilot nor a production or
customer deployment approval.

## Runtime modes

The Enterprise application has exactly two modes:

- `deterministic` is the default when `ENTERPRISE_RUNTIME_MODE` is absent. It
  remains the only mode used by CI and the Docker persistence smoke.
- `pi-real` is explicit opt-in. It requires both `PI_PROVIDER` and `PI_MODEL`.
  There is no fallback from `pi-real` to deterministic mode.

The real mode uses Pi `0.84.3` public `ModelRuntime.create()`, `checkAuth()`,
`getModel()`, and instance `streamSimple()`. Pi owns authentication and
credential resolution. Product code does not inspect, serialize, log, persist,
or return provider credentials, tokens, headers, raw payloads, or reasoning.

Before the Enterprise application opens its HTTP listener, `pi-real` verifies
that Pi recognizes configured authentication and resolves the requested model.
Unavailable authentication, initialization, or model resolution produces a
bounded startup failure. It never silently switches to deterministic mode.

## Preserved product boundary

The adapter instantiates the existing `SupportAgentRuntime` with the Pi-resolved
model and stream function. The existing four tools, Safety precedence,
tenant/store authority, governed 0/1/2+ evidence routing, PostgreSQL business
store, Ticket/Handoff behavior, and Audit behavior are unchanged. This task
continues to use only synthetic portfolio FAQ and knowledge fixtures.

## Bounded manual smoke

After a clean-runner pass, a reviewer may run one bounded smoke with:

```text
ENTERPRISE_RUNTIME_MODE=pi-real
PI_PROVIDER=<Pi provider id>
PI_MODEL=<Pi model id>
node --experimental-transform-types scripts/pi-real-provider-smoke.ts
```

The smoke uses only the synthetic business-hours FAQ and reports only provider,
model, result type, tool names, authorized evidence IDs, and elapsed time. It
does not print answer text, credentials, raw provider payloads, or hidden
reasoning. The task budget is one attempt, with at most one retry only for a
clearly transient provider or network failure. If Pi auth, model resolution,
quota, or the execution environment prevents a safe call, the correct result
is `REAL_PROVIDER_SMOKE_BLOCKED` with a non-sensitive category.

No CI workflow or Docker smoke may invoke a real provider. No store Pilot,
release, tag, merge, or ready-for-review transition is authorized here.
