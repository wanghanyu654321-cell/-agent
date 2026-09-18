# Governed Knowledge Repository

This directory is a read-only product-owned knowledge input boundary. Entries are structured JSON and are validated before a `GovernedKnowledgeRetrievalService` is constructed.

- `approved` is the only status admissible for a production customer-support request.
- `synthetic_test_only` is controlled non-production test data. It is rejected by production runtime and may be used only with explicit test-only retrieval and runtime options.
- `unapproved` and `retired` never authorize customer answers.

There are **zero real production-approved business knowledge entries** in this repository. The fixture directory is intentionally not a production corpus.
