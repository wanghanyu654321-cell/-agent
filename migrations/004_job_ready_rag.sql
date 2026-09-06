-- Core B only. Apply once with the owner migration ledger AFTER 001.
-- No guessed vector dimension/profile. GAP-03 deliberately prohibits indexing.
-- The pgvector extension must be supplied by an independently approved deployment.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE rag_documents (
  tenant_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  document_id TEXT NOT NULL CHECK (char_length(document_id) BETWEEN 1 AND 200),
  version TEXT NOT NULL CHECK (char_length(version) BETWEEN 1 AND 200),
  kind TEXT NOT NULL CHECK (kind IN ('faq','policy','sop','reference')),
  title TEXT NOT NULL CHECK (char_length(title) > 0),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 16000),
  content_sha256 TEXT NOT NULL CHECK (content_sha256 = encode(sha256(convert_to(content,'UTF8')),'hex')),
  source_ref TEXT NOT NULL CHECK (char_length(source_ref) > 0),
  updated_date DATE NOT NULL,
  tags JSONB NOT NULL CHECK (jsonb_typeof(tags) = 'array'),
  status TEXT NOT NULL CHECK (status IN ('approved','unapproved','retired','synthetic_test_only')),
  active BOOLEAN NOT NULL CHECK (NOT active OR status = 'approved'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id,store_id,document_id,version),
  FOREIGN KEY (store_id,tenant_id) REFERENCES stores(id,tenant_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX rag_documents_active_key ON rag_documents (tenant_id,store_id,document_id) WHERE active;

CREATE FUNCTION rag_document_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.tenant_id,NEW.store_id,NEW.document_id,NEW.version,NEW.kind,NEW.title,NEW.content,NEW.content_sha256,NEW.source_ref,NEW.updated_date,NEW.tags,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.tenant_id,OLD.store_id,OLD.document_id,OLD.version,OLD.kind,OLD.title,OLD.content,OLD.content_sha256,OLD.source_ref,OLD.updated_date,OLD.tags,OLD.created_at) THEN
    RAISE EXCEPTION 'knowledge_version_conflict' USING ERRCODE='23514';
  END IF;
  IF OLD.status='retired' AND (NEW.status<>'retired' OR NEW.active) THEN
    RAISE EXCEPTION 'knowledge_version_conflict' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rag_document_immutable BEFORE UPDATE ON rag_documents FOR EACH ROW EXECUTE FUNCTION rag_document_immutable();

CREATE TABLE rag_chunks (
  tenant_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  version TEXT NOT NULL,
  embedding_profile_id TEXT NOT NULL CHECK (char_length(embedding_profile_id) BETWEEN 1 AND 200),
  chunk_id TEXT NOT NULL CHECK (chunk_id ~ '^[0-9a-f]{64}$'),
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 0 AND 7),
  text TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 2000),
  chunk_sha256 TEXT NOT NULL CHECK (chunk_sha256 = encode(sha256(convert_to(text,'UTF8')),'hex')),
  embedding vector NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id,store_id,document_id,version,embedding_profile_id,chunk_id),
  UNIQUE (tenant_id,store_id,document_id,version,embedding_profile_id,ordinal),
  FOREIGN KEY (tenant_id,store_id,document_id,version) REFERENCES rag_documents(tenant_id,store_id,document_id,version) ON DELETE RESTRICT,
  -- A future independently approved migration must bind vector(D), profile and
  -- floor before replacing this guard. Removing it alone is NOT authorized.
  CONSTRAINT gap03_profile_unresolved CHECK (false)
);
CREATE INDEX rag_chunks_scope_profile_idx ON rag_chunks(tenant_id,store_id,embedding_profile_id,document_id,version);

-- NOLOGIN roles hold privileges only. Operator supplies distinct credentials;
-- this migration does not create passwords, public endpoints or business grants.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='job_ready_rag_indexer') THEN
    CREATE ROLE job_ready_rag_indexer NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='job_ready_rag_registry_writer') THEN
    CREATE ROLE job_ready_rag_registry_writer NOLOGIN;
  END IF;
END $$;
REVOKE ALL ON rag_documents,rag_chunks FROM PUBLIC;
REVOKE ALL ON FUNCTION rag_document_immutable() FROM PUBLIC;
GRANT SELECT ON rag_documents TO job_ready_rag_indexer;
GRANT SELECT,INSERT,DELETE ON rag_chunks TO job_ready_rag_indexer;
GRANT SELECT,INSERT ON rag_documents TO job_ready_rag_registry_writer;
GRANT UPDATE(status,active) ON rag_documents TO job_ready_rag_registry_writer;
GRANT SELECT ON rag_chunks TO job_ready_rag_registry_writer;
