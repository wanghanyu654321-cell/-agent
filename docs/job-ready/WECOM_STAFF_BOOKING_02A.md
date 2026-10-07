# WeCom Staff Booking 02A

Baseline: main `97247cef1372fb4440ab56ec53b1a4fe487c2522`. User-approved scope: existing BookingIntent -> independent Staff application card -> confirm/cancel -> existing StoreOps transition -> PostgreSQL -> staff/customer feedback. No production activation in this delivery.

## Frozen implementation contract

- Staff is disabled by default. Six independent Staff settings are required when enabled. Customer KF credentials and token state remain separate.
- Verified encrypted `template_card_event` must match Corp/Agent. EventKey is only `booking_confirm` or `booking_cancel`. TaskId resolves a persisted notification, intended binding, booking and expected version. No external authority fields are used.
- Active binding and current single membership must grant `booking-intent:manage`. Recheck binding/membership in the same transaction as StoreOps; preserve its scoped row lock and version check.
- Confirm uses the server-stored requested start/end. Missing interval means cancel-only card; a forged confirm fails closed. No alternative-time controls, scheduling or capacity promise.
- Reuse `wecom_inbound_messages` for event claims/hash conflict detection. Claim, transition and terminal record commit together; external delivery happens after commit. A task can be acted on once. ResponseCode stays in memory and is never logged or persisted.
- One notification record per booking version and Staff application. Prefer eligible preferred staff; otherwise exactly one eligible binding. Never broadcast or guess among multiple recipients.
- Persist delivery attempt as indeterminate before network calls. No blind retry, no exactly-once claim. Rejected/indeterminate feedback never rolls back business state.
- Resolve customer destination from latest scoped Booking -> customer binding -> active KF channel; never from callback. Render latest committed status with intent-only wording.
- Live customer binding IDs never enter the legacy Booking channel FK. Existing null behavior is retained and tested.

## Engineering verification

- [x] Staff protocol, encrypted callback fixtures, bounded API and independent configuration tests.
- [x] Add scoped notification migration; reuse inbound event ledger and StoreOps transaction through a transaction-bound repository.
- [x] Add idempotent provisioning CLI, notification routing and postcommit feedback; integrate disabled-by-default HTTP/application composition.
- [x] Real isolated PostgreSQL tests for authorization, scope, versions, replay, actual updater, null legacy FK and delivery failures.
- Existing unit, format/lint/type, build, integrity and mandatory PostgreSQL gates have local evidence; Staff is registered in the existing Core A gate. Exact-source Ubuntu Python/HTTP/Docker and evaluation results are governed by the integration PR's Actions run.
- Main integration is explicitly authorized by the owner on 2026-10-07 after independent review and passing CI; no deployment. The integration PR is the verification and merge-state entry, rather than a second mutable checklist here.

## Evidence boundary

Real Staff WeCom E2E: NOT TESTED. Mock API success proves protocol handling only. DeepSeek production remains disabled from the prior rollback; this task does not modify provider, RAG, production knowledge, MCP, Agent tools, Douyin or Meituan.

## Trusted operator provisioning

Verify the actual external staff identity and the existing membership before running this on an approved target. DATABASE_URL stays in operator environment; do not put it or credentials in arguments, docs or Git.

```sh
npm run provision:wecom-staff -- --corp-id <corp-id> --agent-id <staff-agent-id> --user-id <verified-staff-user-id> --membership-id <existing-membership-id>
```

The command uses the existing provisioning transaction. Identical mapping is a no-op; another membership or a disabled mapping is refused. It creates no user, grants no capability, and prints only an opaque binding ID or bounded error category. Staff is still disabled unless separately configured and enabled.

## Review fixes and evidence (2026-10-07)

Independent source review: APPROVED. Operator CLI has real subprocess/PG idempotency and conflict coverage. Card service summary accepts the StoreOps 200-code-point value while retaining at most 128 UTF-16 units without splitting a surrogate pair; durable service text is unchanged. Independent postcommit feedback attempts preserve business state and indeterminate delivery when feedback-state persistence fails. A PostgreSQL trigger fault test verifies customer delivery still occurs once and replay sends neither feedback again.

Local deterministic and mandatory database gates passed; Python ledger assertion was updated from exact 001–006 to exact 001–007. New PR clean-runner CI remains the source of final Ubuntu/Python/HTTP/Docker verification. Historical failures and unverified real Staff E2E are preserved.
