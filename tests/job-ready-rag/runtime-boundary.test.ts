import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, registerFauxProvider, streamSimple } from "@earendil-works/pi-ai/compat";
import { type CustomEntry, SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";
import { InMemorySupportStore, SupportAgentRuntime } from "../../src/index.ts";
import {
	type CandidateEvidence,
	FastApiRetrievalService,
	type RegisteredDocument,
} from "../../src/retrieval/fastapi.ts";

it.each([0, 1, 2, 3])(
	"keeps the existing Pi runtime cardinality rule for %i validated FastAPI documents",
	async (count) => {
		const directory = mkdtempSync(join(tmpdir(), "core-b-runtime-"));
		const faux = registerFauxProvider();
		const hash = (text: string) => createHash("sha256").update(text).digest("hex");
		const scope = { tenantId: "fixture-a", storeId: "fixture-store" };
		const profile = "test-profile";
		const docs: RegisteredDocument[] = [];
		const candidates: CandidateEvidence[] = [];
		for (let i = 0; i < count; i++) {
			const id = `doc-${i}`;
			const content = `CANONICAL_TEST_ONLY_${i}`;
			const chunkSha256 = hash(content);
			const chunkId = hash(JSON.stringify([scope.tenantId, scope.storeId, id, "1", profile, 0, chunkSha256]));
			const entry = {
				id,
				kind: "policy" as const,
				status: "approved" as const,
				title: "fixture",
				content,
				version: "1",
				updatedAt: "2026-09-06",
				sourceRef: `fixture:${id}`,
				tags: [],
				tenantScope: scope.tenantId,
				storeScope: scope.storeId,
			};
			docs.push({
				entry,
				active: true,
				contentSha256: chunkSha256,
				chunks: [{ chunkId, ordinal: 0, text: content, chunkSha256, embeddingProfileId: profile }],
			});
			candidates.push({
				chunkId,
				documentId: id,
				version: "1",
				kind: "policy",
				status: "approved",
				sourceRef: entry.sourceRef,
				scope,
				contentSha256: chunkSha256,
				chunkSha256,
				text: content,
				embeddingProfileId: profile,
				score: 1 - i / 10,
				rank: i + 1,
			});
		}
		const retrieval = new FastApiRetrievalService({
			endpoint: "http://retrieval.internal",
			serviceCredential: "test-service-only",
			embeddingProfileId: profile,
			registry: { current: async () => docs },
			fetch: async (_url, init) =>
				new Response(
					JSON.stringify({
						schemaVersion: "job-ready-v1",
						requestId: JSON.parse(String(init?.body)).requestId,
						candidates,
					}),
					{ headers: { "content-type": "application/json" } },
				),
		});
		try {
			faux.setResponses([
				fauxAssistantMessage(
					[{ type: "toolCall", id: "lookup", name: "search_knowledge", arguments: { query: "查询运营说明" } }],
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage("UNTRUSTED_PROVIDER_PROSE"),
			]);
			const runtime = new SupportAgentRuntime({
				model: faux.getModel(),
				streamFn: streamSimple,
				retrieval,
				store: new InMemorySupportStore(),
				faq: [],
				sessionDirectory: directory,
			});
			const result = await runtime.run({
				conversationId: "rag-test",
				customerId: "customer",
				...scope,
				text: "查询运营说明",
			});
			const entries = SessionManager.open(
				runtime.getSessionFile("rag-test")!,
				directory,
				process.cwd(),
			).getEntries();
			const audit = entries.find(
				(e): e is CustomEntry => e.type === "custom" && e.customType === "support-agent.audit",
			)?.data;
			expect(result.toolsCalled).toEqual(["search_knowledge"]);
			expect(result.sessionEvents.filter((e) => e.type === "tool_execution_start").map((e) => e.toolName)).toEqual([
				"search_knowledge",
			]);
			expect(result.type).toBe(count === 1 ? "answer" : "fallback");
			expect(result.evidence).toEqual(
				count === 1 ? [{ id: "doc-0", kind: "policy", version: "1", sourceRef: "fixture:doc-0" }] : [],
			);
			expect(audit).toMatchObject({
				knowledgeRouting: {
					admittedCandidateCount: count,
					semanticSelectorInvoked: false,
					authorizedEvidenceIds: count === 1 ? ["doc-0"] : [],
				},
			});
			if (count === 1) expect(result.text).toBe("CANONICAL_TEST_ONLY_0");
			else expect(JSON.stringify(entries)).not.toContain("CANONICAL_TEST_ONLY_");
			expect(result.text).not.toContain("UNTRUSTED_PROVIDER_PROSE");
		} finally {
			faux.unregister();
			rmSync(directory, { recursive: true, force: true });
		}
	},
);
