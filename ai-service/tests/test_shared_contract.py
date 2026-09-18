import json
import unittest
from pathlib import Path

from pydantic import ValidationError
from rag_service.contracts import CandidateEvidence, IngestRequest, IngestResponse, SearchRequest, SearchResponse
from rag_service.core import Document, chunks_for, sha256


FIXTURE = json.loads((Path(__file__).resolve().parents[2] / "tests/job-ready-rag/contract-fixture.json").read_text(encoding="utf-8"))


class SharedContractTests(unittest.TestCase):
    def test_every_node_wire_fixture_roundtrips_exactly(self):
        for name, model in (("ingestRequest", IngestRequest), ("ingestResponse", IngestResponse),
                            ("searchRequest", SearchRequest), ("searchResponse", SearchResponse)):
            with self.subTest(name=name):
                self.assertEqual(model.model_validate(FIXTURE[name]).model_dump(), FIXTURE[name])

    def test_every_wire_field_is_required_and_no_extras_are_accepted(self):
        pairs = [(IngestRequest, FIXTURE["ingestRequest"]), (IngestResponse, FIXTURE["ingestResponse"]),
                 (SearchRequest, FIXTURE["searchRequest"]), (SearchResponse, FIXTURE["searchResponse"]),
                 (CandidateEvidence, FIXTURE["searchResponse"]["candidates"][0])]
        for model, payload in pairs:
            for field in payload:
                with self.subTest(model=model.__name__, field=field), self.assertRaises(ValidationError):
                    model.model_validate({key: value for key, value in payload.items() if key != field})
            with self.assertRaises(ValidationError):
                model.model_validate({**payload, "role": "admin"})

    def test_query_rejects_blank_and_nul_like_node(self):
        for query in (" ", "\n\t", "query\x00"):
            with self.subTest(query=repr(query)), self.assertRaises(ValidationError):
                SearchRequest.model_validate({**FIXTURE["searchRequest"], "query": query})

    def test_unicode_chunks_match_shared_node_hashes(self):
        entry = FIXTURE["entry"]
        doc = Document(entry["tenantScope"], entry["storeScope"], entry["id"], entry["version"],
                       entry["kind"], entry["content"], sha256(entry["content"]), entry["sourceRef"], "approved", True)
        candidate = FIXTURE["searchResponse"]["candidates"][0]
        chunk = chunks_for(doc, FIXTURE["searchRequest"]["embeddingProfileId"])[0]
        self.assertEqual(chunk.chunk_id, candidate["chunkId"])
        self.assertEqual(chunk.chunk_sha256, candidate["chunkSha256"])
        self.assertEqual(doc.content_sha256, candidate["contentSha256"])
        self.assertEqual(chunk.text, candidate["text"])
