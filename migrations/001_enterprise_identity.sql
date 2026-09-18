CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (id, tenant_id)
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  store_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('agent', 'supervisor', 'admin')),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (user_id, tenant_id, store_id),
  FOREIGN KEY (store_id, tenant_id) REFERENCES stores(id, tenant_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  store_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (store_id, tenant_id) REFERENCES stores(id, tenant_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  store_id TEXT NOT NULL,
  conversation_id TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (store_id, tenant_id) REFERENCES stores(id, tenant_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS handoffs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  store_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (conversation_id),
  FOREIGN KEY (store_id, tenant_id) REFERENCES stores(id, tenant_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  store_id TEXT NOT NULL,
  conversation_id TEXT,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (store_id, tenant_id) REFERENCES stores(id, tenant_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS stores_tenant_id_idx ON stores (tenant_id, id);
CREATE INDEX IF NOT EXISTS memberships_user_scope_idx ON memberships (user_id, tenant_id, store_id);
CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions (expires_at);
CREATE INDEX IF NOT EXISTS conversations_scope_idx ON conversations (tenant_id, store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tickets_scope_idx ON tickets (tenant_id, store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS handoffs_scope_idx ON handoffs (tenant_id, store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_scope_idx ON audit_events (tenant_id, store_id, created_at DESC);
