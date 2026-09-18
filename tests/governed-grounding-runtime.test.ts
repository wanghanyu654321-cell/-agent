import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, registerFauxProvider, streamSimple } from "@earendil-works/pi-ai/compat";
import { type CustomEntry, SessionManager } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { InMemoryRetrievalService, InMemorySupportStore, SupportAgentRuntime } from "../src/index.ts";
import { GovernedKnowledgeRetrievalService, type KnowledgeEntry } from "../src/knowledge.ts";

const registrations: Array<{ unregister(): void }> = [];

afterEach(() => {
	while (registrations.length > 0) registrations.pop()?.unregister();
});

const approvedPolicy: KnowledgeEntry = {
	id: "controlled-approved-policy",
	kind: "policy",
	status: "approved",
	title: "受控政策",
	content: "受控业务事实：请以登记的审核版本为准。",
	version: "controlled-v1",
	updatedAt: "2026-08-28",
	sourceRef: "test://controlled-approved-policy",
	tags: ["受控", "政策"],
};

function request(text = "请说明受控政策") {
	return {
		conversationId: "governed-grounding",
		tenantId: "tenant-a",
		storeId: "store-a",
		customerId: "customer-a",
		text,
	};
}

describe("V2.0 governed runtime grounding", () => {
	it("returns controlled approved content with structured evidence instead of an invented provider completion", async () => {
		const faux = registerFauxProvider();
		registrations.push(faux);
		faux.setResponses([
			fauxAssistantMessage(
				[{ type: "toolCall", id: "knowledge", name: "search_knowledge", arguments: { query: "受控政策" } }],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("模型编造的业务承诺。"),
		]);
		const runtime = new SupportAgentRuntime({
			model: faux.getModel(),
			streamFn: streamSimple,
			retrieval: new GovernedKnowledgeRetrievalService([approvedPolicy]),
			store: new InMemorySupportStore(),
			faq: [],
		});

		const result = await runtime.run(request());

		expect(result.type).toBe("answer");
		expect(result.text).toBe(approvedPolicy.content);
		expect(result.text).not.toContain("模型编造");
		expect(result.evidence).toEqual([
			{
				id: approvedPolicy.id,
				kind: "policy",
				version: "controlled-v1",
				sourceRef: "test://controlled-approved-policy",
			},
		]);
	});

	it("fails closed when a retrieval service returns bare text without admissible knowledge metadata", async () => {
		const faux = registerFauxProvider();
		registrations.push(faux);
		faux.setResponses([
			fauxAssistantMessage(
				[{ type: "toolCall", id: "bare", name: "search_knowledge", arguments: { query: "受控" } }],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("受控业务事实。"),
		]);
		const runtime = new SupportAgentRuntime({
			model: faux.getModel(),
			streamFn: streamSimple,
			retrieval: new InMemoryRetrievalService([{ id: "bare", text: "受控业务事实。" }]),
			store: new InMemorySupportStore(),
			faq: [],
		});

		const result = await runtime.run(request("请说明受控"));

		expect(result.type).toBe("fallback");
		expect(result.evidence).toEqual([]);
	});

	it("rejects synthetic evidence in production even if a retrieval implementation exposes it", async () => {
		const faux = registerFauxProvider();
		registrations.push(faux);
		faux.setResponses([
			fauxAssistantMessage(
				[{ type: "toolCall", id: "synthetic", name: "search_knowledge", arguments: { query: "受控" } }],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("合成夹具内容。"),
		]);
		const runtime = new SupportAgentRuntime({
			model: faux.getModel(),
			streamFn: streamSimple,
			retrieval: new GovernedKnowledgeRetrievalService(
				[{ ...approvedPolicy, id: "synthetic", status: "synthetic_test_only", content: "合成夹具内容。" }],
				{ allowSyntheticTestFixtures: true },
			),
			store: new InMemorySupportStore(),
			faq: [],
		});

		const result = await runtime.run(request("请说明受控"));

		expect(result.type).toBe("fallback");
		expect(result.text).not.toContain("合成夹具内容");
	});

	it("persists evidence IDs, versions, source references, kinds, query, and admissibility in support-agent.audit", async () => {
		const directory = mkdtempSync(join(tmpdir(), "governed-grounding-audit-"));
		try {
			const faux = registerFauxProvider();
			registrations.push(faux);
			faux.setResponses([
				fauxAssistantMessage(
					[{ type: "toolCall", id: "audit", name: "search_knowledge", arguments: { query: "受控政策" } }],
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage("模型编造的业务承诺。"),
			]);
			const runtime = new SupportAgentRuntime({
				model: faux.getModel(),
				streamFn: streamSimple,
				retrieval: new GovernedKnowledgeRetrievalService([approvedPolicy]),
				store: new InMemorySupportStore(),
				faq: [],
				sessionDirectory: directory,
			});

			await runtime.run(request("请说明受控政策"));
			const audit = SessionManager.open(runtime.getSessionFile("governed-grounding")!, directory, process.cwd())
				.getEntries()
				.find(
					(entry): entry is CustomEntry => entry.type === "custom" && entry.customType === "support-agent.audit",
				)?.data;

			expect(audit).toMatchObject({
				grounding: {
					retrievalQuery: "受控政策",
					admissible: true,
					evidence: [
						{
							id: "controlled-approved-policy",
							version: "controlled-v1",
							sourceRef: "test://controlled-approved-policy",
							kind: "policy",
						},
					],
				},
			});
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
