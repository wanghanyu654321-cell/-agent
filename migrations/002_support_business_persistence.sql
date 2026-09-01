-- Phase 2B: business records are scoped to the same tenant/store as their conversation.
-- Migration 001 remains immutable historical identity evidence.

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS pi_session_id TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
UPDATE conversations SET updated_at = created_at WHERE updated_at IS NULL;
ALTER TABLE conversations ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_id_tenant_store_key;
ALTER TABLE conversations
  ADD CONSTRAINT conversations_id_tenant_store_key UNIQUE (id, tenant_id, store_id);

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS summary TEXT;
UPDATE tickets SET summary = 'Legacy support ticket' WHERE summary IS NULL;
ALTER TABLE tickets ALTER COLUMN summary SET NOT NULL;
ALTER TABLE tickets ALTER COLUMN conversation_id SET NOT NULL;
ALTER TABLE tickets ALTER COLUMN id SET DEFAULT ('ticket-' || gen_random_uuid()::text);
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_conversation_scope_fkey;
ALTER TABLE tickets
  ADD CONSTRAINT tickets_conversation_scope_fkey
  FOREIGN KEY (conversation_id, tenant_id, store_id)
  REFERENCES conversations (id, tenant_id, store_id)
  ON DELETE RESTRICT;

ALTER TABLE handoffs DROP CONSTRAINT IF EXISTS handoffs_conversation_id_key;
ALTER TABLE handoffs DROP CONSTRAINT IF EXISTS handoffs_scope_conversation_key;
ALTER TABLE handoffs ALTER COLUMN id SET DEFAULT ('handoff-' || gen_random_uuid()::text);
ALTER TABLE handoffs
  ADD CONSTRAINT handoffs_scope_conversation_key UNIQUE (tenant_id, store_id, conversation_id);
ALTER TABLE handoffs DROP CONSTRAINT IF EXISTS handoffs_conversation_scope_fkey;
ALTER TABLE handoffs
  ADD CONSTRAINT handoffs_conversation_scope_fkey
  FOREIGN KEY (conversation_id, tenant_id, store_id)
  REFERENCES conversations (id, tenant_id, store_id)
  ON DELETE RESTRICT;

ALTER TABLE audit_events ALTER COLUMN id SET DEFAULT ('audit-' || gen_random_uuid()::text);
ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_conversation_scope_fkey;
ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_conversation_scope_fkey
  FOREIGN KEY (conversation_id, tenant_id, store_id)
  REFERENCES conversations (id, tenant_id, store_id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS tickets_conversation_scope_idx
  ON tickets (tenant_id, store_id, conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS handoffs_conversation_scope_idx
  ON handoffs (tenant_id, store_id, conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_conversation_scope_idx
  ON audit_events (tenant_id, store_id, conversation_id, created_at DESC);
