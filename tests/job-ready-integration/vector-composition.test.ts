import type { Pool } from "pg";
import { expect, it } from "vitest";
import { createEnterpriseApplication, startEnterpriseApplicationFromEnv } from "../../src/enterprise/application.ts";
import { enterpriseVectorRetrievalFactoryFromEnv } from "../../src/enterprise/vector-retrieval.ts";
import { FastApiRetrievalService } from "../../src/retrieval/fastapi.ts";

const env = {
	ENTERPRISE_RETRIEVAL_MODE: "vector",
	RAG_SERVICE_URL: "http://ai-service:8000",
	RAG_SERVICE_CREDENTIAL: "fixture-only",
	RAG_EMBEDDING_PROFILE: "openai-text-embedding-3-small-1536-v1",
	RAG_CORPUS_CLASSIFICATION: "public-synthetic",
};

it("leaves default/explicit lexical composition untouched and builds the existing vector adapter", () => {
	expect(enterpriseVectorRetrievalFactoryFromEnv({})).toBeUndefined();
	expect(enterpriseVectorRetrievalFactoryFromEnv({ ENTERPRISE_RETRIEVAL_MODE: "lexical" })).toBeUndefined();
	const factory = enterpriseVectorRetrievalFactoryFromEnv(env);
	expect(factory?.({} as Pool)).toBeInstanceOf(FastApiRetrievalService);
});

it("fails before DB/provider work for incomplete env or conflicting explicit compositions", async () => {
	await expect(
		startEnterpriseApplicationFromEnv({
			DATABASE_URL: "postgresql://127.0.0.1/unused",
			ENTERPRISE_RETRIEVAL_MODE: "vector",
		}),
	).rejects.toThrow("S2 hosted profile");
	const retrieval = { search: async () => [] };
	await expect(
		createEnterpriseApplication({
			databaseUrl: "postgresql://127.0.0.1/unused",
			retrieval,
			retrievalFactory: () => retrieval,
		}),
	).rejects.toThrow("Select one retrieval composition");
});

it("rejects incomplete, private or test-only vector configuration before opening a pool", () => {
	for (const key of Object.keys(env).filter((key) => key !== "ENTERPRISE_RETRIEVAL_MODE")) {
		const incomplete: NodeJS.ProcessEnv = { ...env };
		delete incomplete[key];
		expect(() => enterpriseVectorRetrievalFactoryFromEnv(incomplete)).toThrow();
	}
	for (const change of [
		{ ENTERPRISE_RETRIEVAL_MODE: "hybrid" },
		{ ENTERPRISE_KNOWLEDGE_MODE: "private" },
		{ RAG_CORPUS_CLASSIFICATION: "private" },
		{ RAG_EMBEDDING_PROFILE: "deterministic-test-1536-v1" },
		{ RAG_SERVICE_CREDENTIAL: "bad\r\ncredential" },
		{ RAG_SERVICE_URL: "https://public.example" },
		{ RAG_SERVICE_URL: "http://user:password@127.0.0.1" },
		{ RAG_SERVICE_URL: "http://127.0.0.1/not-root" },
	]) {
		expect(() => enterpriseVectorRetrievalFactoryFromEnv({ ...env, ...change })).toThrow();
	}
});
