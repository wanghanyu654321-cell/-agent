-- Real WeChat Customer Service identity split:
-- open_kfid selects server-approved execution authority; external_userid is customer identity only.
CREATE TABLE wecom_kf_channels (
 id TEXT PRIMARY KEY,
 corp_id TEXT NOT NULL,
 open_kfid TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 store_id TEXT NOT NULL,
 authority_membership_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK (status IN ('active','disabled')),
 version INTEGER NOT NULL CHECK (version > 0),
 created_at TIMESTAMPTZ NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL,
 UNIQUE (corp_id, open_kfid),
 UNIQUE (id, tenant_id, store_id),
 FOREIGN KEY (store_id, tenant_id) REFERENCES stores(id, tenant_id) ON DELETE RESTRICT,
 FOREIGN KEY (authority_membership_id, tenant_id, store_id)
   REFERENCES memberships(id, tenant_id, store_id) ON DELETE RESTRICT
);
CREATE INDEX wecom_kf_channels_scope_status_idx
  ON wecom_kf_channels(tenant_id, store_id, status);

CREATE TABLE wecom_customer_bindings (
 id TEXT PRIMARY KEY,
 channel_binding_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 store_id TEXT NOT NULL,
 external_userid TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 conversation_id TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL,
 UNIQUE (channel_binding_id, external_userid),
 UNIQUE (id, channel_binding_id, tenant_id, store_id, conversation_id),
 FOREIGN KEY (channel_binding_id, tenant_id, store_id)
   REFERENCES wecom_kf_channels(id, tenant_id, store_id) ON DELETE RESTRICT,
 FOREIGN KEY (conversation_id, tenant_id, store_id, customer_id)
   REFERENCES conversations(id, tenant_id, store_id, customer_id) ON DELETE RESTRICT
);
CREATE INDEX wecom_customer_bindings_scope_idx
  ON wecom_customer_bindings(tenant_id, store_id, conversation_id);

CREATE TABLE wecom_customer_inbound_messages (
 id TEXT PRIMARY KEY,
 corp_id TEXT NOT NULL,
 open_kfid TEXT NOT NULL,
 message_id TEXT NOT NULL,
 payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
 state TEXT NOT NULL CHECK (state IN ('processing','routed','completed','failed','indeterminate')),
 request_id TEXT NOT NULL,
 channel_binding_id TEXT,
 customer_binding_id TEXT,
 tenant_id TEXT,
 store_id TEXT,
 conversation_id TEXT,
 result_type TEXT CHECK (result_type IN ('answer','fallback','escalation')),
 error_category TEXT,
 created_at TIMESTAMPTZ NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL,
 UNIQUE (corp_id, open_kfid, message_id),
 CHECK (
   (channel_binding_id IS NULL AND customer_binding_id IS NULL AND tenant_id IS NULL AND store_id IS NULL AND conversation_id IS NULL)
   OR
   (channel_binding_id IS NOT NULL AND customer_binding_id IS NOT NULL AND tenant_id IS NOT NULL AND store_id IS NOT NULL AND conversation_id IS NOT NULL)
 ),
 FOREIGN KEY (channel_binding_id, tenant_id, store_id)
   REFERENCES wecom_kf_channels(id, tenant_id, store_id) ON DELETE RESTRICT,
 FOREIGN KEY (customer_binding_id, channel_binding_id, tenant_id, store_id, conversation_id)
   REFERENCES wecom_customer_bindings(id, channel_binding_id, tenant_id, store_id, conversation_id) ON DELETE RESTRICT
);
CREATE INDEX wecom_customer_inbound_scope_idx
  ON wecom_customer_inbound_messages(tenant_id, store_id, created_at, id);
