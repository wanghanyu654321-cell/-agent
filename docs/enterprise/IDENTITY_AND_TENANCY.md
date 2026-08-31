# Enterprise identity and tenancy foundation

**PORTFOLIO AUTHENTICATION — NOT PRODUCTION ENTERPRISE IAM.**

Phase 2A introduces the minimum server-side identity authority required before an
enterprise-facing support request can reach the existing Runtime:

```text
Auth session -> user -> membership -> role -> capabilities -> tenant/store
```

Roles are code-owned and intentionally non-configurable:

| Role | Capabilities |
| --- | --- |
| `agent` | `agent:invoke`, `conversation:read`, `ticket:create` |
| `supervisor` | agent capabilities plus `handoff:create` |
| `admin` | supervisor capabilities plus `audit:read` |

`stores.tenant_id` is a foreign key to `tenants`; a membership has a composite
foreign key to `(stores.id, stores.tenant_id)`. A membership therefore cannot name a
store from another tenant. The migration also creates the migration-ready, scoped
business tables `conversations`, `tickets`, `handoffs`, and `audit_events`; Phase 2A
does not connect `SupportAgentRuntime` persistence to them.

## Authentication

`POST /api/v1/auth/login` verifies an email/password with Node `scrypt` and creates a
random opaque cookie token. Only its SHA-256 hash is stored in `auth_sessions`; plaintext
passwords and raw session tokens are never persisted. The cookie uses `HttpOnly`,
`SameSite=Strict`, `Path=/`, `Max-Age`, and `Expires`; `Secure` is opt-in for HTTPS so
local Portfolio HTTP remains usable. Logout deletes the server-side session. Login
failure always returns the same `invalid_credentials` result.

Implemented endpoints are `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, and
`GET /api/v1/auth/me`. OAuth, SSO, MFA, password reset, verification email, SCIM, and
directory synchronization are explicitly out of scope.

## Synthetic demo seed

`seedPortfolioEnterpriseDemoData()` creates only synthetic non-production data:

| User | Scope | Role | Demo login |
| --- | --- | --- | --- |
| Alice Agent | Demo Retail Group A / Store A1 | agent | `alice.agent@demo.example` / `AliceDemo!2026` |
| Susan Supervisor | Demo Retail Group A / Store A1 | supervisor | `susan.supervisor@demo.example` / `SusanDemo!2026` |
| Bob Agent | Demo Retail Group B / Store B1 | agent | `bob.agent@demo.example` / `BobDemo!2026` |

These credentials are deliberately public Portfolio fixtures, never production secrets.

## PostgreSQL verification

`migrations/001_enterprise_identity.sql` is explicit SQL and `PostgresIdentityRepository`
implements the same identity repository contract as the deterministic in-memory test
repository. To run the real integration suite, point `POSTGRES_TEST_URL` at a disposable
PostgreSQL database, then run `npm run test:postgres-identity`. The suite applies the
migration and truncates the listed enterprise tables, so it must never target production.
