# Private Real-Knowledge Input Boundary

`knowledge/private/` is intentionally Git-ignored. Put real approved source-derived JSON entries there only in a controlled local or mounted environment; never commit raw internal manuals, price sheets, customer records, source documents, or identifiers to this public repository.

Set `SUPPORT_AGENT_PRIVATE_KNOWLEDGE_DIR` to the absolute path of that directory. `loadPrivateKnowledgeCorpus()` then applies the existing `KnowledgeEntry` validation before retrieval begins. The repository does not scan this path automatically and does not treat any checked-in synthetic fixture as real knowledge.

Keep a public source manifest with source IDs, hashes, scope, approval reference, and non-sensitive aggregate counts. Do not put raw private content into the manifest.
