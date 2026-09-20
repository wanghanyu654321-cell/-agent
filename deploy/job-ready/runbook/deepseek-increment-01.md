# Increment 01: DeepSeek pi-real rollout

Status: implementation candidate. Real-model acceptance, PostgreSQL acceptance of this
candidate, deterministic production regression and pi-real live acceptance remain
unproven until their respective runs complete. Production real model: NOT ENABLED.

## Provider resolution

Pi remains pinned at 0.84.3. Its native `deepseek` provider supplies auth and the
OpenAI-compatible transport, but its bundled catalog predates `deepseek-flash`.
`src/enterprise/deepseek-provider.ts` registers that model through Pi's existing
`registerProvider` API. No SDK, runtime or dependency upgrade is introduced.
DeepSeek composition ignores host-local models.json overrides to keep the official
endpoint fixed. Other providers retain their existing configuration behavior.

`PI_PROVIDER=deepseek`, `PI_MODEL=deepseek-flash`, API endpoint
`https://api.deepseek.com`. Runtime thinking remains off; the offline wire test
verifies explicit `thinking: {type: "disabled"}`. Output is capped at 2048 tokens.
Text-only input is intentional for this increment.

Sources checked 2026-09-20:
[release/model alias](https://api-docs.deepseek.com/updates/),
[model and pricing](https://api-docs.deepseek.com/quick_start/pricing/).
The registered cost metadata uses peak pricing, not a measured billing claim.

## Policy boundary

Only pi-real composition enables `real-policy-v1`. The deterministic runtime, AgentProfile
v1/hash, four tools, server authority, retrieval admission and PostgreSQL writes remain
in place. Final policy uses server facts, never a model-declared intent or success flag.

- AUTO: fixed greeting, existing Safety response, or existing governed evidence answer.
- WORKFLOW: confirmed current-turn business-store ticket write; fixed acknowledgement.
- HUMAN: durable handoff, explicit escalation requirement, or bounded high-risk cues.
  A routing decision alone does not claim a persisted handoff or completed booking.
- SAFE_FALLBACK: failure, invalid/empty output, or missing evidence. Unknown factual
  answers cannot escape through the former factual-keyword heuristic.

High-risk cue matching is deliberately small and is not universal intent recognition.
Unknown requests still cannot produce free-form factual answers. Existing Safety retains
priority and professional-care instructions. Policy metadata is added to existing audit;
no transcript logger or tracing infrastructure is introduced.

## Independent synthetic real eval

Ordinary CI remains offline. Run once, only with a developer/test credential already
set in the process and `POSTGRES_TEST_URL` pointing at a disposable test database:

```sh
node evals/deepseek/run-real.ts --test-database
```

The flag acknowledges test database writes and existing migrations. Never point this
at production. The runner creates a unique synthetic tenant and preserves its rows for
inspection; it does not truncate shared tables. Nine cases cover FAQ, knowledge,
complaint, compensation, unsupported booking, no evidence, injection, invalid arguments
and successful ticket workflow. It uses the same Pi/runtime/service composition and
reads ticket/handoff state from PostgreSQL. No automatic suite retry.

Metrics are per case, no composite score. Policy precheck is not credited as model tool
selection. An invalid call that was never proposed is `NOT_EXERCISED`, making the report
PARTIAL rather than PASS. Deterministic invalid-argument tests are separate evidence.
The model-returned version is `null / NOT_EXPOSED_BY_PINNED_PI`: Pi normalizes the
assistant model field to the requested ID. Do not mislabel it as an API-returned snapshot.
Reports include timestamp, requested model and fixture version. Missing prerequisites
produce BLOCKED with null measurements. Errors omit credential-bearing exception text.

## Stage 1: deterministic deployment

Use a reviewed/merged immutable candidate and passed clean-runner gates. Do not merge
or deploy merely because offline provider tests pass. In `/opt/customer-support-agent-public`
keep the existing protected `.env.production` set to:

```dotenv
ENTERPRISE_RUNTIME_MODE=deterministic
```

The actual application variable is `ENTERPRISE_RUNTIME_MODE`, not `RUNTIME_MODE`.
After installing the reviewed source via the normal release procedure:

```sh
cd /opt/customer-support-agent-public
docker compose --env-file .env.production -f compose.production.yaml -p customer-support-agent-public up -d --no-deps --build app
docker compose --env-file .env.production -f compose.production.yaml -p customer-support-agent-public ps app
curl --fail --silent --show-error http://127.0.0.1:3000/healthz
```

Verify the existing public HTTPS health endpoint. Owner sends a fresh ordinary WeChat
message and confirms receipt. Stop on failure. Do not print `.env.production`, resolved
Compose configuration, container environment or raw customer messages.

## Stage 2: owner-enabled real model

Requires Stage 1 regression, real eval and PostgreSQL gates to pass. Owner edits the
protected env file locally on the server (no key through chat, Git or logs):

```dotenv
ENTERPRISE_RUNTIME_MODE=pi-real
PI_PROVIDER=deepseek
PI_MODEL=deepseek-flash
# DEEPSEEK_API_KEY is set privately by the owner.
```

Then recreate **app only**, using the same Compose command without `--build`. Repeat
local/public health and five owner-sent WeChat cases: FAQ, refund timing, complaint plus
compensation, absent knowledge, unsupported booking. Governed production knowledge must
exist for factual acceptance; synthetic portfolio knowledge is not merchant policy.
Record only redacted outcome metadata. Health alone is not model acceptance.

If any safety gate fails, owner restores `ENTERPRISE_RUNTIME_MODE=deterministic` and
recreates app only; repeat health and ordinary WeChat regression. Do not change PostgreSQL,
volumes, Nginx or WeCom configuration; never run `down -v`.

Booking Staff HITL, Staff WeCom self-built app, Douyin, Meituan, handoff/ticket lifecycle
and WeCom pagination are not implemented by this increment.
