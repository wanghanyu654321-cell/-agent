-- Staff task identity is server-owned. No callback credentials or customer PII here.
ALTER TABLE booking_intents ADD CONSTRAINT booking_intents_id_scope_key UNIQUE (id,tenant_id,store_id);
CREATE TABLE wecom_staff_booking_notifications (
 task_id TEXT PRIMARY KEY,
 booking_id TEXT NOT NULL REFERENCES booking_intents(id) ON DELETE RESTRICT,
 tenant_id TEXT NOT NULL, store_id TEXT NOT NULL,
 corp_id TEXT NOT NULL, application_id TEXT NOT NULL,
 binding_id TEXT NOT NULL,
 expected_version INTEGER NOT NULL CHECK (expected_version > 0),
 delivery_state TEXT NOT NULL CHECK (delivery_state IN ('accepted','rejected','indeterminate')),
 feedback_state TEXT NOT NULL DEFAULT 'not_sent' CHECK (feedback_state IN ('not_sent','accepted','rejected','indeterminate')),
 customer_delivery_state TEXT NOT NULL DEFAULT 'not_sent' CHECK (customer_delivery_state IN ('not_sent','accepted','rejected','indeterminate','unavailable')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE (booking_id, expected_version, corp_id, application_id),
 FOREIGN KEY (booking_id,tenant_id,store_id) REFERENCES booking_intents(id,tenant_id,store_id) ON DELETE RESTRICT,
 FOREIGN KEY (binding_id,tenant_id,store_id) REFERENCES channel_bindings(id,tenant_id,store_id) ON DELETE RESTRICT,
 FOREIGN KEY (store_id,tenant_id) REFERENCES stores(id,tenant_id) ON DELETE RESTRICT
);
