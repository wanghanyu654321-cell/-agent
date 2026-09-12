-- S2 successor: 004's rejecting guard guaranteed no pre-profile generations.
-- The existing migration ledger applies this entire file in one transaction.
ALTER TABLE rag_chunks ALTER COLUMN embedding TYPE vector(1536);
ALTER TABLE rag_chunks DROP CONSTRAINT gap03_profile_unresolved;
ALTER TABLE rag_chunks ADD CONSTRAINT rag_chunks_s2_profile CHECK (
    embedding_profile_id IN (
        'openai-text-embedding-3-small-1536-v1',
        'deterministic-test-1536-v1'
    )
);

-- Schema lookup is required in addition to 004's per-table privileges.
GRANT USAGE ON SCHEMA public
TO job_ready_rag_indexer,
   job_ready_rag_registry_writer;
