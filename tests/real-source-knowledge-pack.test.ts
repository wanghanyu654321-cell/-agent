import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, registerFauxProvider, streamSimple } from "@earendil-works/pi-ai/compat";
import { afterEach, describe, expect, it } from "vitest";
import { createPiEnterpriseRuntimeFactory } from "../src/enterprise/pi-runtime.ts";
import { loadPrivateStoreKnowledgeComposition } from "../src/enterprise/private-knowledge.ts";
import {
	materializePilotRealSourceKnowledgePack,
	PILOT_REAL_SOURCE_ENTRY_IDS,
	PILOT_REAL_SOURCE_SCOPE,
} from "../src/enterprise/real-source-knowledge-pack.ts";
import type { KnowledgeEntry } from "../src/knowledge.ts";

const directories: string[] = [];
const unregisterProviders: Array<() => void> = [];

afterEach(() => {
	while (unregisterProviders.length > 0) unregisterProviders.pop()?.();
	for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function approvedPublicEntries(): KnowledgeEntry[] {
	return JSON.parse(
		readFileSync("knowledge/public-benchmark/approved/meituan-local-services-2026.json", "utf8"),
	) as KnowledgeEntry[];
}

function materializedDirectory(): string {
	const directory = mkdtempSync(join(tmpdir(), "pilot-real-source-knowledge-"));
	directories.push(directory);
	materializePilotRealSourceKnowledgePack(approvedPublicEntries(), directory);
	return directory;
}

function runtimeFromMaterializedPack() {
	const directory = materializedDirectory();
	const composition = loadPrivateStoreKnowledgeComposition({ SUPPORT_AGENT_PRIVATE_KNOWLEDGE_DIR: directory });
	const faux = registerFauxProvider();
	unregisterProviders.push(faux.unregister);
	const runtime = createPiEnterpriseRuntimeFactory(
		{ model: faux.getModel(), streamFn: streamSimple },
		composition,
	)(undefined as never).runtime;
	return { faux, runtime };
}

function request(
	text: string,
	tenantId: string = PILOT_REAL_SOURCE_SCOPE.tenantId,
	storeId: string = PILOT_REAL_SOURCE_SCOPE.storeId,
) {
	return {
		conversationId: `pilot-real-source-${text}-${tenantId}-${storeId}`,
		tenantId,
		storeId,
		customerId: "portfolio-evaluation-customer",
		text,
	};
}

function toolCall(id: string, name: "search_faq" | "search_knowledge", query: string) {
	return fauxAssistantMessage([{ type: "toolCall", id, name, arguments: { query } }], { stopReason: "toolUse" });
}

function invalidToolCall(id: string, name: "search_faq" | "search_knowledge") {
	return fauxAssistantMessage([{ type: "toolCall", id, name, arguments: {} }], { stopReason: "toolUse" });
}

describe("Job-ready real-source knowledge pack V1", () => {
	it("materializes exactly the allowlisted official entries with preserved facts and one opaque Pilot scope", () => {
		const directory = materializedDirectory();
		const scoped = loadPrivateStoreKnowledgeComposition({ SUPPORT_AGENT_PRIVATE_KNOWLEDGE_DIR: directory });
		const materialized = [...scoped.faq, ...scoped.knowledge];
		const originalById = new Map(approvedPublicEntries().map((entry) => [entry.id, entry]));

		expect(materialized.map((entry) => entry.id).sort()).toEqual([...PILOT_REAL_SOURCE_ENTRY_IDS].sort());
		expect(materialized).toHaveLength(8);
		for (const entry of materialized) {
			const original = originalById.get(entry.id);
			expect(original).toBeDefined();
			expect(entry).toMatchObject({
				status: "approved",
				tenantScope: PILOT_REAL_SOURCE_SCOPE.tenantId,
				storeScope: PILOT_REAL_SOURCE_SCOPE.storeId,
				version: original?.version,
				sourceRef: original?.sourceRef,
			});
			if ("answer" in entry) expect(entry.answer).toBe(original?.content);
			else expect(entry.content).toBe(original?.content);
		}
		expect(scoped.allowSyntheticTestFixtures).toBe(false);
		expect(scoped.allowSyntheticTestKnowledge).toBe(false);
		expect(materialized.map((entry) => entry.id)).not.toEqual(
			expect.arrayContaining([
				"PB-MT-FULFILLMENT-RESERVATION",
				"PB-MT-FULFILLMENT-CLOSURE",
				"PB-MT-FULFILLMENT-ALTERNATIVE",
				"PB-MT-SCOPE-TENANT",
				"PB-MT-SCOPE-STORE",
			]),
		);
		expect(JSON.stringify(materialized)).not.toContain("demo-");
	});

	it("routes an allowlisted FAQ and a single policy through the existing private composition", async () => {
		const { faux, runtime } = runtimeFromMaterializedPack();
		faux.setResponses([
			toolCall("real-source-faq", "search_faq", "普通团购券未验证退款帮助"),
			fauxAssistantMessage("MODEL_SHOULD_NOT_BE_USED"),
		]);
		const faq = await runtime.run(request("普通团购券未验证退款帮助"));
		expect(faq).toMatchObject({
			type: "answer",
			toolsCalled: ["search_faq"],
			evidence: [{ id: "PB-DP-HELP-UNVERIFIED" }],
		});

		faux.setResponses([
			toolCall("real-source-policy", "search_knowledge", "商户无法履约"),
			fauxAssistantMessage("MODEL_SHOULD_NOT_BE_USED"),
		]);
		const policy = await runtime.run(request("商户无法履约"));
		expect(policy).toMatchObject({
			type: "answer",
			toolsCalled: ["search_knowledge"],
			evidence: [{ id: "PB-MT-MERCHANT-CANNOT-FULFILL" }],
		});
	});

	it("fails closed for zero evidence, multiple evidence, and a request outside the Pilot scope", async () => {
		const { faux, runtime } = runtimeFromMaterializedPack();
		faux.setResponses([
			toolCall("real-source-none", "search_knowledge", "UNRELATED_NO_ANSWER_CASE"),
			fauxAssistantMessage("MODEL_SHOULD_NOT_BE_USED"),
		]);
		const noAnswer = await runtime.run(request("UNRELATED_NO_ANSWER_CASE"));
		expect(noAnswer).toMatchObject({ type: "fallback", evidence: [] });

		faux.setResponses([
			toolCall("real-source-ambiguous", "search_knowledge", "过期未消费团购券退款"),
			fauxAssistantMessage("MODEL_SHOULD_NOT_BE_USED"),
		]);
		const ambiguous = await runtime.run(request("过期未消费团购券退款"));
		expect(ambiguous).toMatchObject({ type: "fallback", evidence: [] });

		faux.setResponses([
			toolCall("real-source-scope", "search_faq", "普通团购券未验证退款帮助"),
			fauxAssistantMessage("MODEL_SHOULD_NOT_BE_USED"),
		]);
		const outsideScope = await runtime.run(request("普通团购券未验证退款帮助", "other-tenant", "other-store"));
		expect(outsideScope).toMatchObject({ type: "fallback", evidence: [] });
	});

	it("allows a single approved knowledge hit after a read-only FAQ miss", async () => {
		const { faux, runtime } = runtimeFromMaterializedPack();
		faux.setResponses([
			toolCall("real-source-faq-miss", "search_faq", "商户无法履约"),
			toolCall("real-source-policy-after-faq-miss", "search_knowledge", "商户无法履约"),
			fauxAssistantMessage("MODEL_SHOULD_NOT_BE_USED"),
		]);

		const result = await runtime.run(request("商户无法履约"));

		expect(result).toMatchObject({
			type: "answer",
			toolsCalled: ["search_faq", "search_knowledge"],
			evidence: [{ id: "PB-MT-MERCHANT-CANNOT-FULFILL" }],
		});
	});

	it("keeps a FAQ miss followed by zero governed knowledge evidence fail closed", async () => {
		const { faux, runtime } = runtimeFromMaterializedPack();
		faux.setResponses([
			toolCall("real-source-faq-miss-zero", "search_faq", "UNRELATED_NO_ANSWER_CASE"),
			toolCall("real-source-zero-after-faq-miss", "search_knowledge", "UNRELATED_NO_ANSWER_CASE"),
			fauxAssistantMessage("MODEL_SHOULD_NOT_BE_USED"),
		]);

		const result = await runtime.run(request("UNRELATED_NO_ANSWER_CASE"));

		expect(result).toMatchObject({ type: "fallback", evidence: [] });
	});

	it("keeps a FAQ probe followed by ambiguous governed knowledge fail closed", async () => {
		const { faux, runtime } = runtimeFromMaterializedPack();
		faux.setResponses([
			toolCall("real-source-faq-miss-ambiguous", "search_faq", "过期未消费团购券退款"),
			toolCall("real-source-ambiguous-after-faq-miss", "search_knowledge", "过期未消费团购券退款"),
			fauxAssistantMessage("MODEL_SHOULD_NOT_BE_USED"),
		]);

		const result = await runtime.run(request("过期未消费团购券退款"));

		expect(result).toMatchObject({ type: "fallback", evidence: [] });
	});

	it("keeps a tool failure fail closed even when later knowledge has one approved evidence item", async () => {
		const { faux, runtime } = runtimeFromMaterializedPack();
		faux.setResponses([
			invalidToolCall("real-source-invalid-faq", "search_faq"),
			toolCall("real-source-policy-after-tool-failure", "search_knowledge", "商户无法履约"),
			fauxAssistantMessage("MODEL_SHOULD_NOT_BE_USED"),
		]);

		const result = await runtime.run(request("商户无法履约"));

		expect(result).toMatchObject({ type: "fallback", evidence: [] });
		expect(result.sessionEvents.some((event) => event.type === "tool_execution_end" && event.isError)).toBe(true);
	});

	it("keeps the committed case manifest as human-authored evaluation scenarios, not customer conversations", () => {
		const manifest = JSON.parse(readFileSync("knowledge/pilot-real-source-v1/case-manifest.json", "utf8")) as {
			selectedSourceIds: string[];
			cases: Array<{ caseId: string; provenance: string; category: string; expectedOutcome: string }>;
		};
		expect(manifest.selectedSourceIds).toEqual(PILOT_REAL_SOURCE_ENTRY_IDS);
		expect(manifest.cases).toHaveLength(13);
		expect(manifest.cases.every((item) => item.provenance === "HUMAN_AUTHORED_TEST_CASE")).toBe(true);
		expect(manifest.cases.filter((item) => item.expectedOutcome === "fallback")).toHaveLength(5);
		expect(manifest.cases.filter((item) => item.category === "no_answer")).toHaveLength(3);
		expect(manifest.cases.some((item) => item.category === "ambiguity_fail_closed")).toBe(true);
		expect(manifest.cases.some((item) => item.category === "scope_isolation")).toBe(true);
	});
});
