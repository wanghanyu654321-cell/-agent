import asyncio
import copy
import unittest
from contextlib import asynccontextmanager
from pydantic import ValidationError
from rag_service.contracts import IngestRequest, SearchRequest
from rag_service.core import Document, Profile, RetrievalError, RetrievalService, chunks_for, rank_candidates, sha256

SCOPE = {"tenantId": "tenant", "storeId": "store"}
PROFILE = Profile("fixture-v1", 2, 0.5)

def document(document_id="d1", content="approved fixture", **changes):
    values = dict(tenant_id="tenant", store_id="store", document_id=document_id,
                  version="v1", kind="policy", content=content,
                  content_sha256=sha256(content), source_ref="fixture:policy", status="approved", active=True)
    values.update(changes)
    return Document(**values)

def ingest_request(doc=None):
    doc = doc or document()
    return IngestRequest(schemaVersion="job-ready-v1", requestId="request-1", scope=SCOPE,
                         documentId=doc.document_id, version=doc.version,
                         contentSha256=doc.content_sha256, embeddingProfileId=PROFILE.profile_id)

def search_request(**changes):
    values = dict(schemaVersion="job-ready-v1", requestId="request-1", scope=SCOPE,
                  query="fixture question", topK=3, embeddingProfileId=PROFILE.profile_id)
    values.update(changes)
    return SearchRequest(**values)

class FixtureEmbedding:
    profile_id = "fixture-v1"
    async def ready(self):
        return True
    async def embed(self, text):
        return (1.0, 0.0)

class MemoryRepository:
    """Test-only transactional substitute, never a production authority."""
    def __init__(self, documents):
        self.documents, self.index = documents, []
        self.lock, self.fail_publish = asyncio.Lock(), False
    async def ready(self):
        return True
    @asynccontextmanager
    async def ingestion(self, request):
        async with self.lock:
            original, repo = copy.deepcopy(self.index), self
            class Transaction:
                async def document(self):
                    return next((d for d in repo.documents if
                                 (d.tenant_id, d.store_id, d.document_id, d.version) ==
                                 (request.scope.tenantId, request.scope.storeId, request.documentId, request.version)), None)
                async def chunks(self):
                    return [c for c in repo.index if (c.document_id, c.version, c.profile_id, c.tenant_id, c.store_id) ==
                            (request.documentId, request.version, request.embeddingProfileId, request.scope.tenantId, request.scope.storeId)]
                async def publish(self, chunks):
                    old = await self.chunks()
                    repo.index = [c for c in repo.index if c not in old] + list(chunks)
                    if repo.fail_publish:
                        raise RuntimeError("private SQL failure")
            try:
                yield Transaction()
            except BaseException:
                self.index = original
                raise
    async def search_rows(self, request):
        return [(d, c) for d in self.documents for c in self.index if
                (d.tenant_id, d.store_id, d.document_id, d.version) == (c.tenant_id, c.store_id, c.document_id, c.version)]

class ContractsAndChunking(unittest.TestCase):
    def test_rejects_coercion_extra_fields_wrong_schema_and_surrogates(self):
        for changes in ({"topK": True}, {"topK": "3"}, {"topK": 2}, {"query": 3},
                        {"query": ""}, {"query": "a" * 4001}, {"query": "\ud800"},
                        {"schemaVersion": "v2"}, {"role": "admin"}, {"requestId": ""}):
            with self.subTest(changes=repr(changes)), self.assertRaises(ValidationError):
                search_request(**changes)
    def test_unicode_hash_tuple_matches_independent_node_literal(self):
        c = chunks_for(document("文档", "美😀é\n", tenant_id="租户", store_id="店"), PROFILE.profile_id)[0]
        self.assertEqual(c.chunk_sha256, "197a6b39076b8674fb64ac83cd98c782911bd3b6f07eba65399d347784f2f43c")
        self.assertEqual(c.chunk_id, "413139e870c049a674d0be45a4f296e32eac450416e6b85c4b3a3c506ae0e9b3")
    def test_codepoint_boundaries_zero_overlap_and_no_truncation(self):
        content = "😀" * 16000
        chunks = chunks_for(document(content=content), PROFILE.profile_id)
        self.assertEqual([len(c.text) for c in chunks], [2000] * 8)
        self.assertEqual([c.ordinal for c in chunks], list(range(8)))
        self.assertEqual("".join(c.text for c in chunks), content)
        with self.assertRaises(RetrievalError):
            chunks_for(document(content=content + "x"), PROFILE.profile_id)

class RetrievalBehavior(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.repo = MemoryRepository([document()])
        self.engine = RetrievalService(self.repo, FixtureEmbedding(), PROFILE)
    async def test_concurrent_ingest_idempotency(self):
        results = await asyncio.gather(*(self.engine.ingest(ingest_request()) for _ in range(8)))
        self.assertEqual(sorted(r.outcome for r in results), ["already_indexed"] * 7 + ["indexed"])
        self.assertEqual(len(self.repo.index), 1)
    async def test_atomic_publish_rollback(self):
        self.repo.fail_publish = True
        with self.assertRaises(RuntimeError):
            await self.engine.ingest(ingest_request())
        self.assertEqual(self.repo.index, [])
    async def test_registry_scope_status_active_hash_and_content_mismatch_fail_closed(self):
        for changes in ({"tenant_id": "other"}, {"store_id": "other"}, {"status": "retired"},
                        {"active": False}, {"status": "unapproved"}, {"status": "synthetic_test_only"},
                        {"content_sha256": "0" * 64}, {"content": "changed bytes"}):
            with self.subTest(changes=changes):
                self.repo.documents = [document(**changes)]
                with self.assertRaises(RetrievalError):
                    await self.engine.ingest(ingest_request())
                self.assertEqual(self.repo.index, [])
    async def test_malformed_vector_never_publishes(self):
        class BadEmbedding(FixtureEmbedding):
            async def embed(self, text):
                return (float("nan"), 0.0)
        self.engine.embedding = BadEmbedding()
        with self.assertRaises(RetrievalError):
            await self.engine.ingest(ingest_request())
        self.assertEqual(self.repo.index, [])
    async def test_cancel_propagates_and_rolls_back(self):
        entered, cancelled = asyncio.Event(), asyncio.Event()
        class SlowEmbedding(FixtureEmbedding):
            async def embed(self, text):
                entered.set()
                try:
                    await asyncio.Event().wait()
                finally:
                    cancelled.set()
        self.engine.embedding = SlowEmbedding()
        task = asyncio.create_task(self.engine.ingest(ingest_request()))
        await entered.wait()
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertTrue(cancelled.is_set())
        self.assertEqual(self.repo.index, [])
    async def test_empty_success_differs_from_missing_profile_floor(self):
        self.assertEqual((await self.engine.search(search_request())).candidates, [])
        for profile in (None, Profile("fixture-v1", 2, None)):
            with self.assertRaises(RetrievalError) as raised:
                await RetrievalService(self.repo, FixtureEmbedding(), profile).search(search_request())
            self.assertEqual(raised.exception.code, "retrieval_unavailable")
    async def test_unloadable_embedding_and_unready_db_fail_before_work(self):
        async def unavailable():
            return False
        self.engine.embedding.ready = unavailable
        with self.assertRaises(RetrievalError):
            await self.engine.health()
        self.engine.embedding = FixtureEmbedding()
        self.repo.ready = unavailable
        with self.assertRaises(RetrievalError):
            await self.engine.search(search_request())
        with self.assertRaises(RetrievalError):
            await self.engine.ingest(ingest_request())
        self.assertEqual(self.repo.index, [])
    async def test_ranking_filters_groups_floor_and_ties(self):
        docs = [document("a", "a" * 2100), document("b"), document("c"), document("d"),
                document("foreign", tenant_id="other"), document("wrong-store", store_id="other"),
                document("retired", status="retired"), document("inactive", active=False),
                document("faq", kind="faq"), document("unapproved", status="unapproved")]
        rows = []
        for d in docs:
            for c in chunks_for(d, PROFILE.profile_id):
                c.embedding = (1.0, 0.0)
                rows.append((d, c))
        for name, profile, vector in (("other-profile", "wrong", (1.0, 0.0)), ("low", PROFILE.profile_id, (0.0, 1.0))):
            d = document(name)
            c = chunks_for(d, profile)[0]
            c.embedding = vector
            rows.append((d, c))
        result = rank_candidates(rows, search_request(), PROFILE, (1.0, 0.0))
        self.assertEqual([c.documentId for c in result], ["a", "b", "c"])
        self.assertEqual([c.rank for c in result], [1, 2, 3])
        self.assertEqual([c.score for c in result], [1.0] * 3)
    async def test_retirement_stops_search_without_chunk_deletion(self):
        await self.engine.ingest(ingest_request())
        self.assertEqual(len((await self.engine.search(search_request())).candidates), 1)
        self.repo.documents = [document(status="retired", active=False)]
        self.assertEqual((await self.engine.search(search_request())).candidates, [])
    async def test_forged_chunk_and_multiple_active_versions_fail_closed(self):
        first = document("same")
        second = document("same", version="v2")
        rows = []
        for doc in (first, second):
            chunk = chunks_for(doc, PROFILE.profile_id)[0]
            chunk.embedding = (1.0, 0.0)
            rows.append((doc, chunk))
        with self.assertRaises(RetrievalError):
            rank_candidates(rows, search_request(), PROFILE, (1.0, 0.0))
        rows = rows[:1]
        rows[0][1].text = "fabricated"
        with self.assertRaises(RetrievalError):
            rank_candidates(rows, search_request(), PROFILE, (1.0, 0.0))


if __name__ == "__main__":
    unittest.main()
