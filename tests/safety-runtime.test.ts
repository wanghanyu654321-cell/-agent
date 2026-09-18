import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, registerFauxProvider, streamSimple } from "@earendil-works/pi-ai/compat";
import { type CustomEntry, SessionManager } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { InMemoryRetrievalService, InMemorySupportStore, SupportAgentRuntime } from "../src/index.ts";
import { ApprovedSafetyRetrievalService, type SafetyKnowledgeEntry } from "../src/safety.ts";

const registrations: Array<{ unregister(): void }> = [];

afterEach(() => {
	while (registrations.length > 0) registrations.pop()?.unregister();
});

describe("V1 safety runtime", () => {
	it("pauses and creates an idempotent qualified-human handoff when safety evidence is absent", async () => {
		const faux = registerFauxProvider();
		registrations.push(faux);
		faux.setResponses([fauxAssistantMessage("请继续操作。")]);
		const store = new InMemorySupportStore();
		const runtime = new SupportAgentRuntime({
			model: faux.getModel(),
			streamFn: streamSimple,
			retrieval: new InMemoryRetrievalService(),
			store,
			faq: [],
		});

		const result = await runtime.run({
			conversationId: "safety-1",
			tenantId: "tenant-a",
			storeId: "store-a",
			customerId: "customer-a",
			text: "顾客说可能过敏，请直接告诉我怎么处理。",
		});

		expect(result.type).toBe("escalation");
		expect(result.text).toContain("暂停");
		expect(store.getHandoffs()).toHaveLength(1);
		expect(store.getHandoffs()[0]?.reason).toContain("allergy");
	});

	it("rejects synthetic test evidence in production and never leaks it as a supported option", async () => {
		const faux = registerFauxProvider();
		registrations.push(faux);
		faux.setResponses([
			fauxAssistantMessage(
				[
					{
						type: "toolCall",
						id: "synthetic-search",
						name: "search_knowledge",
						arguments: { query: "过敏 pause" },
					},
				],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("模型声称已确认专业情况并要求继续。"),
		]);
		const synthetic: SafetyKnowledgeEntry = {
			id: "synthetic-only",
			domain: "safety",
			riskCategory: "allergy",
			status: "synthetic_test_only",
			version: "test-v1",
			updatedAt: "2026-08-28",
			scope: ["pause"],
			evidenceText: "NON-PRODUCTION fixture",
			allowedOptions: [{ action: "synthetic option", risk: "fixture risk", likelyResult: "fixture result" }],
			requiresEscalation: false,
		};
		const runtime = new SupportAgentRuntime({
			model: faux.getModel(),
			streamFn: streamSimple,
			retrieval: new ApprovedSafetyRetrievalService([synthetic]),
			store: new InMemorySupportStore(),
			faq: [],
		});

		const result = await runtime.run({
			conversationId: "safety-synthetic",
			tenantId: "tenant-a",
			storeId: "store-a",
			customerId: "customer-a",
			text: "顾客说可能过敏，请告诉我怎么继续。",
		});

		expect(result.type).toBe("escalation");
		expect(result.text).not.toContain("synthetic option");
	});

	it("returns only explicitly approved fixture options and ignores an unsafe model completion", async () => {
		const faux = registerFauxProvider();
		registrations.push(faux);
		faux.setResponses([
			fauxAssistantMessage(
				[{ type: "toolCall", id: "approved-search", name: "search_knowledge", arguments: { query: "过敏 pause" } }],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("模型声称已确认专业情况并要求继续。"),
		]);
		const approvedFixture: SafetyKnowledgeEntry = {
			id: "test-approved-workflow-entry",
			domain: "safety",
			riskCategory: "allergy",
			status: "approved",
			version: "test-v1",
			updatedAt: "2026-08-28",
			scope: ["pause"],
			evidenceText: "TEST-ONLY workflow evidence",
			allowedOptions: [{ action: "test approved option", risk: "test risk", likelyResult: "test result" }],
			requiresEscalation: false,
		};
		const runtime = new SupportAgentRuntime({
			model: faux.getModel(),
			streamFn: streamSimple,
			retrieval: new ApprovedSafetyRetrievalService([approvedFixture]),
			store: new InMemorySupportStore(),
			faq: [],
		});

		const result = await runtime.run({
			conversationId: "safety-approved",
			tenantId: "tenant-a",
			storeId: "store-a",
			customerId: "customer-a",
			text: "顾客说可能过敏，请告诉我怎么处理。",
		});

		expect(result.type).toBe("answer");
		expect(result.text).toContain("test approved option");
		expect(result.text).not.toContain("模型声称已确认专业情况");
	});

	it("creates one qualified-human handoff when duplicate safety runs race", async () => {
		const faux = registerFauxProvider();
		registrations.push(faux);
		faux.setResponses([fauxAssistantMessage("请继续操作。"), fauxAssistantMessage("请继续操作。")]);
		const store = new InMemorySupportStore();
		const createRuntime = () =>
			new SupportAgentRuntime({
				model: faux.getModel(),
				streamFn: streamSimple,
				retrieval: new InMemoryRetrievalService(),
				store,
				faq: [],
			});
		const request = {
			conversationId: "safety-race",
			tenantId: "tenant-a",
			storeId: "store-a",
			customerId: "customer-a",
			text: "顾客说可能过敏，请直接告诉我怎么处理。",
		};

		const results = await Promise.all([createRuntime().run(request), createRuntime().run(request)]);

		expect(results.map((result) => result.type)).toEqual(["escalation", "escalation"]);
		expect(store.getHandoffs()).toHaveLength(1);
	});

	it("persists observable safety audit data without provider completion text", async () => {
		const directory = mkdtempSync(join(tmpdir(), "pi-safety-audit-"));
		try {
			const faux = registerFauxProvider();
			registrations.push(faux);
			faux.setResponses([
				fauxAssistantMessage(
					[{ type: "toolCall", id: "audit-search", name: "search_knowledge", arguments: { query: "过敏 pause" } }],
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage("模型内部回答文本不应写入审计。"),
			]);
			const runtime = new SupportAgentRuntime({
				model: faux.getModel(),
				streamFn: streamSimple,
				retrieval: new InMemoryRetrievalService(),
				store: new InMemorySupportStore(),
				faq: [],
				sessionDirectory: directory,
			});

			await runtime.run({
				conversationId: "safety-audit",
				tenantId: "tenant-a",
				storeId: "store-a",
				customerId: "customer-a",
				text: "顾客说可能过敏，请处理。",
			});
			const restored = SessionManager.open(runtime.getSessionFile("safety-audit")!, directory, process.cwd());
			const audit = restored
				.getEntries()
				.find(
					(entry): entry is CustomEntry => entry.type === "custom" && entry.customType === "support-agent.audit",
				)?.data;

			expect(audit).toMatchObject({
				safety: {
					riskCategory: "allergy",
					retrievalQuery: "过敏 pause",
					evidenceIds: [],
					disposition: "escalate",
					handoffResult: "created",
				},
			});
			expect(JSON.stringify(audit)).not.toContain("模型内部回答文本不应写入审计");
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
