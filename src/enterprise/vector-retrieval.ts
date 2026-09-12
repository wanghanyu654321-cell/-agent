import { isIP } from "node:net";
import type { Pool } from "pg";
import type { RetrievalService } from "../index.ts";
import { FastApiRetrievalService, PostgresRagRegistry } from "../retrieval/fastapi.ts";

/** Only explicit public/synthetic vector composition may reach hosted embeddings. */
export function enterpriseVectorRetrievalFactoryFromEnv(
	env: NodeJS.ProcessEnv = process.env,
): ((pool: Pool) => RetrievalService) | undefined {
	const mode = env.ENTERPRISE_RETRIEVAL_MODE?.trim() || "lexical";
	if (mode === "lexical") return undefined;
	if (
		mode !== "vector" ||
		env.ENTERPRISE_KNOWLEDGE_MODE?.trim() === "private" ||
		env.RAG_CORPUS_CLASSIFICATION !== "public-synthetic" ||
		env.RAG_EMBEDDING_PROFILE !== "openai-text-embedding-3-small-1536-v1"
	)
		throw new Error("Vector retrieval requires the S2 hosted profile and a public/synthetic corpus.");
	const endpoint = env.RAG_SERVICE_URL?.trim() || "";
	const serviceCredential = env.RAG_SERVICE_CREDENTIAL?.trim() || "";
	try {
		const url = new URL(endpoint);
		const parts = url.hostname.split(".").map(Number);
		const privateV4 =
			isIP(url.hostname) === 4 &&
			(parts[0] === 127 ||
				parts[0] === 10 ||
				(parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
				(parts[0] === 192 && parts[1] === 168));
		if (!(privateV4 || ["localhost", "[::1]", "ai-service"].includes(url.hostname))) throw new Error();
		// Reuse the adapter's URL/credential validation before application DB work.
		new FastApiRetrievalService({
			endpoint,
			serviceCredential,
			embeddingProfileId: env.RAG_EMBEDDING_PROFILE,
			registry: { current: async () => [] },
		});
	} catch {
		throw new Error("Vector retrieval requires a private RAG_SERVICE_URL and valid RAG_SERVICE_CREDENTIAL.");
	}
	const embeddingProfileId = env.RAG_EMBEDDING_PROFILE;
	return (pool) =>
		new FastApiRetrievalService({
			endpoint,
			serviceCredential,
			embeddingProfileId,
			registry: new PostgresRagRegistry(pool),
		});
}
