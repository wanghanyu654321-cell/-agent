-- Applied once by the existing migration ledger during final integration.
ALTER TABLE memberships ADD CONSTRAINT memberships_id_scope_key UNIQUE (id, tenant_id, store_id);
ALTER TABLE conversations ADD CONSTRAINT conversations_id_scope_customer_key UNIQUE (id, tenant_id, store_id, customer_id);

CREATE TABLE channel_bindings (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, store_id TEXT NOT NULL,
 corp_id TEXT NOT NULL, application_id TEXT NOT NULL, external_subject_id TEXT NOT NULL,
 membership_id TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('active','disabled')),
 version INTEGER NOT NULL CHECK (version > 0), created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
 UNIQUE (corp_id, application_id, external_subject_id), UNIQUE (id, tenant_id, store_id),
 FOREIGN KEY (store_id, tenant_id) REFERENCES stores(id, tenant_id) ON DELETE RESTRICT,
 FOREIGN KEY (membership_id, tenant_id, store_id) REFERENCES memberships(id, tenant_id, store_id) ON DELETE RESTRICT
);
CREATE INDEX channel_bindings_scope_status_idx ON channel_bindings(tenant_id, store_id, status);

CREATE TABLE daily_availability (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, store_id TEXT NOT NULL, staff_membership_id TEXT NOT NULL,
 local_date DATE NOT NULL, time_zone TEXT NOT NULL, windows JSONB NOT NULL CHECK (jsonb_typeof(windows) = 'array' AND jsonb_array_length(windows) <= 24),
 status TEXT NOT NULL CHECK (status IN ('published','withdrawn')), source TEXT NOT NULL CHECK (source = 'human'),
 version INTEGER NOT NULL CHECK (version > 0), updated_by_membership_id TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
 UNIQUE (tenant_id, store_id, staff_membership_id, local_date),
 FOREIGN KEY (store_id, tenant_id) REFERENCES stores(id, tenant_id) ON DELETE RESTRICT,
 FOREIGN KEY (staff_membership_id, tenant_id, store_id) REFERENCES memberships(id, tenant_id, store_id) ON DELETE RESTRICT,
 FOREIGN KEY (updated_by_membership_id, tenant_id, store_id) REFERENCES memberships(id, tenant_id, store_id) ON DELETE RESTRICT
);
CREATE INDEX daily_availability_scope_date_idx ON daily_availability(tenant_id, store_id, local_date);

CREATE TABLE booking_intents (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, store_id TEXT NOT NULL, conversation_id TEXT NOT NULL, customer_id TEXT NOT NULL,
 channel_binding_id TEXT, requested_service TEXT NOT NULL CHECK (length(requested_service) BETWEEN 1 AND 200),
 requested_start TIMESTAMPTZ, requested_end TIMESTAMPTZ, preferred_staff_membership_id TEXT,
 status TEXT NOT NULL CHECK (status IN ('pending_confirmation','confirmed','alternative_proposed','cancelled')),
 alternative_start TIMESTAMPTZ, alternative_end TIMESTAMPTZ, confirmed_start TIMESTAMPTZ, confirmed_end TIMESTAMPTZ,
 created_by_membership_id TEXT NOT NULL, updated_by_membership_id TEXT NOT NULL, idempotency_key TEXT NOT NULL,
 create_request_hash TEXT NOT NULL CHECK (create_request_hash ~ '^[0-9a-f]{64}$'), version INTEGER NOT NULL CHECK (version > 0),
 created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
 CHECK ((requested_start IS NULL AND requested_end IS NULL) OR (requested_start IS NOT NULL AND requested_end IS NOT NULL AND requested_end > requested_start)),
 CHECK ((alternative_start IS NULL AND alternative_end IS NULL) OR (alternative_start IS NOT NULL AND alternative_end IS NOT NULL AND alternative_end > alternative_start)),
 CHECK ((confirmed_start IS NULL AND confirmed_end IS NULL) OR (confirmed_start IS NOT NULL AND confirmed_end IS NOT NULL AND confirmed_end > confirmed_start)),
 CHECK (status <> 'alternative_proposed' OR alternative_start IS NOT NULL), CHECK (status <> 'confirmed' OR confirmed_start IS NOT NULL),
 UNIQUE (tenant_id, store_id, idempotency_key),
 FOREIGN KEY (store_id, tenant_id) REFERENCES stores(id, tenant_id) ON DELETE RESTRICT,
 FOREIGN KEY (conversation_id, tenant_id, store_id, customer_id) REFERENCES conversations(id, tenant_id, store_id, customer_id) ON DELETE RESTRICT,
 FOREIGN KEY (channel_binding_id, tenant_id, store_id) REFERENCES channel_bindings(id, tenant_id, store_id) ON DELETE RESTRICT,
 FOREIGN KEY (preferred_staff_membership_id, tenant_id, store_id) REFERENCES memberships(id, tenant_id, store_id) ON DELETE RESTRICT,
 FOREIGN KEY (created_by_membership_id, tenant_id, store_id) REFERENCES memberships(id, tenant_id, store_id) ON DELETE RESTRICT,
 FOREIGN KEY (updated_by_membership_id, tenant_id, store_id) REFERENCES memberships(id, tenant_id, store_id) ON DELETE RESTRICT
);
CREATE INDEX booking_intents_scope_status_idx ON booking_intents(tenant_id, store_id, status, created_at DESC, id);

CREATE TABLE wecom_inbound_messages (
 id TEXT PRIMARY KEY, corp_id TEXT NOT NULL, application_id TEXT NOT NULL, message_id TEXT NOT NULL,
 payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
 state TEXT NOT NULL CHECK (state IN ('processing','completed','failed','indeterminate')),
 binding_id TEXT, tenant_id TEXT, store_id TEXT, conversation_id TEXT, request_id TEXT NOT NULL,
 result_type TEXT CHECK (result_type IN ('answer','fallback','escalation')), error_category TEXT,
 delivery_state TEXT NOT NULL CHECK (delivery_state IN ('not_sent','sent','indeterminate')),
 created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
 UNIQUE (corp_id, application_id, message_id),
 CHECK ((binding_id IS NULL AND tenant_id IS NULL AND store_id IS NULL) OR (binding_id IS NOT NULL AND tenant_id IS NOT NULL AND store_id IS NOT NULL)),
 CHECK (conversation_id IS NULL OR (tenant_id IS NOT NULL AND store_id IS NOT NULL)),
 FOREIGN KEY (store_id, tenant_id) REFERENCES stores(id, tenant_id) ON DELETE RESTRICT,
 FOREIGN KEY (binding_id, tenant_id, store_id) REFERENCES channel_bindings(id, tenant_id, store_id) ON DELETE RESTRICT,
 FOREIGN KEY (conversation_id, tenant_id, store_id) REFERENCES conversations(id, tenant_id, store_id) ON DELETE RESTRICT
);
CREATE INDEX wecom_inbound_scope_idx ON wecom_inbound_messages(tenant_id, store_id, created_at, id);
CREATE UNIQUE INDEX wecom_inbound_active_conversation_key ON wecom_inbound_messages(tenant_id, store_id, conversation_id)
 WHERE state = 'processing' AND conversation_id IS NOT NULL;
