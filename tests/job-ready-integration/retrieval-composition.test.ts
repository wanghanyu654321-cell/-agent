import { createHash } from "node:crypto";
import { fauxAssistantMessage, registerFauxProvider, streamSimple } from "@earendil-works/pi-ai/compat";
import { expect, it, vi } from "vitest";
import { createPiEnterpriseRuntimeFactory } from "../../src/enterprise/pi-runtime.ts";
import type { KnowledgeEntry } from "../../src/knowledge.ts";
import { canonicalChunks, FastApiRetrievalService } from "../../src/retrieval/fastapi.ts";

it.each([false, true])(
	"composes the reviewed FastAPI adapter through the enterprise Pi factory (unavailable=%s)",
	async (unavailable) => {
		const scope = { tenantId: "integration-tenant", storeId: "integration-store" };
		const entry: KnowledgeEntry = {
			id: "integration-document",
			kind: "reference",
			status: "approved",
			title: "Fixture only",
			content: "Canonical fixture only.",
			version: "1",
			sourceRef: "test://integration-document",
			updatedAt: "2026-09-06",
			tags: [],
			tenantScope: scope.tenantId,
			storeScope: scope.storeId,
		};
		const profile = "offline-fixture-not-approved-profile";
		const chunks = canonicalChunks(entry, profile);
		const contentSha256 = createHash("sha256").update(entry.content).digest("hex");
		const transport = vi.fn<typeof fetch>(async (_url, init) => {
			const request = JSON.parse(String(init?.body));
			expect(request.scope).toEqual(scope);
			if (unavailable) return Response.json({ error: "retrieval_unavailable" }, { status: 503 });
			return Response.json({
				schemaVersion: "job-ready-v1",
				requestId: request.requestId,
				candidates: [
					{
						chunkId: chunks[0].chunkId,
						documentId: entry.id,
						version: entry.version,
						sourceRef: entry.sourceRef,
						kind: entry.kind,
						scope,
						status: entry.status,
						contentSha256,
						chunkSha256: chunks[0].chunkSha256,
						text: chunks[0].text,
						score: 1,
						rank: 1,
						embeddingProfileId: profile,
					},
				],
			});
		});
		const retrieval = new FastApiRetrievalService({
			endpoint: "http://test-only.internal",
			serviceCredential: "offline-fixture-only",
			embeddingProfileId: profile,
			registry: { current: async () => [{ entry, active: true, contentSha256, chunks }] },
			fetch: transport,
		});
		const faux = registerFauxProvider();
		try {
			const business = {
				findConversationById: vi.fn(),
				createConversation: vi.fn(),
				setConversationPiSession: vi.fn(),
				listConversations: vi.fn(),
				listTickets: vi.fn(),
				listHandoffs: vi.fn(),
				listAuditEvents: vi.fn(),
				createTicket: vi.fn(),
				findTicket: vi.fn(),
				createHandoff: vi.fn(),
				findHandoff: vi.fn(),
				recordAudit: vi.fn(),
			};
			faux.setResponses([fauxAssistantMessage("Untrusted provider prose.")]);
			const resource = createPiEnterpriseRuntimeFactory(
				{ model: faux.getModel(), streamFn: streamSimple },
				{
					faq: [],
					knowledge: [],
					allowSyntheticTestFixtures: false,
					allowSyntheticTestKnowledge: false,
				},
			)(business, retrieval);
			const result = await resource.runtime.run({
				...scope,
				conversationId: `integration-${unavailable}`,
				customerId: "fixture",
				text: "查询普通规则",
			});
			expect(transport).toHaveBeenCalledTimes(1);
			expect(result.type).toBe(unavailable ? "fallback" : "answer");
			expect(result.evidence).toEqual(
				unavailable ? [] : [{ id: entry.id, kind: entry.kind, version: entry.version, sourceRef: entry.sourceRef }],
			);
			expect(result.toolsCalled).toEqual(["search_knowledge"]);
			expect(business.recordAudit).toHaveBeenCalledTimes(1);
			expect(business.createTicket).not.toHaveBeenCalled();
			expect(business.createHandoff).not.toHaveBeenCalled();
			if (!unavailable) expect(result.text).toBe(entry.content);
			expect(result.text).not.toContain("Untrusted provider prose");
		} finally {
			faux.unregister();
		}
	},
);
