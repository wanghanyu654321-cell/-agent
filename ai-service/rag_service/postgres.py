"""Parameterized PostgreSQL boundary, supplied an async dict-row connection factory.

Compatible with psycopg AsyncConnection: execute -> cursor, transaction context,
fetchone/fetchall awaitables. Integration owns driver installation and connection
secrets. No connection, credential lookup, schema application or model is created here.
"""
import json
from contextlib import asynccontextmanager
from dataclasses import fields

from .core import Chunk, Document, RetrievalError


def read_document(row):
    return Document(**{field.name: row[field.name] for field in fields(Document)})


def read_chunk(row):
    vector = row["embedding"]
    if isinstance(vector, str):
        vector = json.loads(vector)
    return Chunk(row["tenant_id"], row["store_id"], row["document_id"], row["version"],
                 row["embedding_profile_id"], row["chunk_id"], row["ordinal"], row["text"],
                 row["chunk_sha256"], vector)


class PostgresRepository:
    def __init__(self, connection_factory, profile):
        self.connection_factory, self.profile = connection_factory, profile

    async def ready(self):
        self.profile.validate()
        async with self.connection_factory() as connection:
            async with connection.transaction():
                await connection.execute("SET LOCAL statement_timeout = '1500ms'")
                cursor = await connection.execute("""
                    SELECT (
                      EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')
                      AND to_regclass('public.rag_documents') IS NOT NULL
                      AND to_regclass('public.rag_chunks') IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM pg_constraint
                        WHERE conrelid = to_regclass('public.rag_chunks')
                          AND conname = 'gap03_profile_unresolved')
                      AND EXISTS (SELECT 1 FROM pg_attribute
                        WHERE attrelid = to_regclass('public.rag_chunks') AND attname = 'embedding'
                          AND format_type(atttypid, atttypmod) = %s)
                      AND has_table_privilege(current_user, 'public.rag_documents', 'SELECT')
                      AND NOT has_any_column_privilege(current_user, 'public.rag_documents', 'UPDATE')
                      AND NOT has_table_privilege(current_user, 'public.rag_documents', 'INSERT')
                      AND NOT has_table_privilege(current_user, 'public.rag_documents', 'DELETE')
                      AND NOT has_any_column_privilege(current_user, 'public.rag_chunks', 'UPDATE')
                      AND NOT EXISTS (SELECT 1 FROM pg_class relation JOIN pg_namespace namespace
                        ON namespace.oid = relation.relnamespace
                        WHERE namespace.nspname = 'public' AND relation.relkind IN ('r', 'p')
                          AND relation.relname NOT IN ('rag_documents', 'rag_chunks')
                          AND (has_table_privilege(current_user, relation.oid, 'SELECT,INSERT,DELETE,TRUNCATE')
                            OR has_any_column_privilege(current_user, relation.oid, 'UPDATE')))
                      AND has_table_privilege(current_user, 'public.rag_chunks', 'INSERT')
                    ) AS ready
                """, (f"vector({self.profile.dimensions})",))
                row = await cursor.fetchone()
                return row is not None and row["ready"] is True

    @asynccontextmanager
    async def ingestion(self, request):
        async with self.connection_factory() as connection:
            async with connection.transaction():
                await connection.execute("SET LOCAL statement_timeout = '1500ms'")
                # Same cross-version lock as the Node registry writer, keeping
                # registry SELECT-only privileges (row locks require UPDATE).
                document_key = json.dumps([request.scope.tenantId, request.scope.storeId, request.documentId],
                                          ensure_ascii=False, separators=(",", ":"))
                await connection.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (document_key,))
                # Lock all concurrent attempts for one immutable scoped generation.
                key = json.dumps([request.scope.tenantId, request.scope.storeId,
                                  request.documentId, request.version, request.embeddingProfileId],
                                 ensure_ascii=False, separators=(",", ":"))
                await connection.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (key,))
                yield PostgresIngestion(connection, request)

    async def search_rows(self, request):
        async with self.connection_factory() as connection:
            async with connection.transaction():
                await connection.execute("SET LOCAL statement_timeout = '1500ms'")
                cursor = await connection.execute("""
                    SELECT d.tenant_id, d.store_id, d.document_id, d.version, d.kind,
                           d.content, d.content_sha256, d.source_ref, d.status, d.active,
                           c.embedding_profile_id, c.chunk_id, c.ordinal, c.text,
                           c.chunk_sha256, c.embedding::text AS embedding
                    FROM public.rag_documents d JOIN public.rag_chunks c
                      ON d.tenant_id = c.tenant_id AND d.store_id = c.store_id
                      AND d.document_id = c.document_id AND d.version = c.version
                    WHERE d.tenant_id = %s AND d.store_id = %s
                      AND c.embedding_profile_id = %s AND d.status = 'approved'
                      AND d.active AND d.kind IN ('policy', 'sop', 'reference')
                    ORDER BY d.document_id, c.chunk_id LIMIT %s
                """, (request.scope.tenantId, request.scope.storeId, request.embeddingProfileId, 1025))
                rows = await cursor.fetchall()
                # Explicit bounded exact scan: never return a trimmed partial ranking.
                if len(rows) > 1024:
                    raise RetrievalError()
                return [(read_document(row), read_chunk(row)) for row in rows]


class PostgresIngestion:
    def __init__(self, connection, request):
        self.connection, self.request = connection, request
        self.identity = (request.scope.tenantId, request.scope.storeId, request.documentId, request.version)

    async def document(self):
        cursor = await self.connection.execute("""
            SELECT tenant_id, store_id, document_id, version, kind, content,
                   content_sha256, source_ref, status, active
            FROM public.rag_documents
            WHERE tenant_id = %s AND store_id = %s AND document_id = %s AND version = %s
        """, self.identity)
        row = await cursor.fetchone()
        return read_document(row) if row is not None else None

    async def chunks(self):
        cursor = await self.connection.execute("""
            SELECT tenant_id, store_id, document_id, version, embedding_profile_id,
                   chunk_id, ordinal, text, chunk_sha256, embedding::text AS embedding
            FROM public.rag_chunks WHERE tenant_id = %s AND store_id = %s
              AND document_id = %s AND version = %s AND embedding_profile_id = %s
            ORDER BY ordinal LIMIT 9
        """, self.identity + (self.request.embeddingProfileId,))
        rows = await cursor.fetchall()
        if len(rows) > 8:
            raise RetrievalError("knowledge_version_conflict", 409)
        return [read_chunk(row) for row in rows]

    async def publish(self, chunks):
        # All validation/embedding finishes before the first insert; transaction
        # rollback (including CancelledError) keeps the generation invisible.
        for chunk in chunks:
            await self.connection.execute("""
                INSERT INTO public.rag_chunks
                  (tenant_id, store_id, document_id, version, embedding_profile_id,
                   chunk_id, ordinal, text, chunk_sha256, embedding, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::vector, now())
            """, self.identity + (chunk.profile_id, chunk.chunk_id, chunk.ordinal,
                                    chunk.text, chunk.chunk_sha256,
                                    json.dumps(list(chunk.embedding), allow_nan=False, separators=(",", ":"))))
