import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, registerFauxProvider, streamSimple } from "@earendil-works/pi-ai/compat";
import { afterEach, describe, expect, it, vi } from "vitest";
import { enterpriseKnowledgeModeFromEnv, enterpriseRuntimeFactoryFromEnv } from "../src/enterprise/application.ts";
import { createPiEnterpriseRuntimeFactory } from "../src/enterprise/pi-runtime.ts";
import {
	loadPrivateStoreKnowledgeComposition,
	type PrivateStoreKnowledgeComposition,
} from "../src/enterprise/private-knowledge.ts";

const directories: string[] = [];
const unregisterProviders: Array<() => void> = [];

afterEach(() => {
	while (unregisterProviders.length > 0) unregisterProviders.pop()?.();
	for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixtureDirectory(entries: unknown[]): string {
	const directory = mkdtempSync(join(tmpdir(), "private-store-knowledge-"));
	directories.push(directory);
	writeFileSync(join(directory, "entries.json"), JSON.stringify(entries));
	return directory;
}

function entry(overrides: Record<string, unknown> = {}) {
	return {
		id: "private-fixture-entry",
		kind: "policy",
		status: "approved",
		title: "PRIVATE_FIXTURE_POLICY_QUERY",
		content: "PRIVATE_FIXTURE_POLICY_CONTENT",
		version: "fixture-v1",
		updatedAt: "2026-09-04",
		tenantScope: "tenant-private",
		storeScope: "store-private",
		sourceRef: "test://private-store-knowledge/fixture",
		tags: ["private", "policy"],
		...overrides,
	};
}

function privateEnvironment(directory: string): NodeJS.ProcessEnv {
	return {
		ENTERPRISE_RUNTIME_MODE: "pi-real",
		ENTERPRISE_KNOWLEDGE_MODE: "private",
		PI_PROVIDER: "fake-provider",
		PI_MODEL: "fake-model",
		SUPPORT_AGENT_PRIVATE_KNOWLEDGE_DIR: directory,
	};
}

function request(text: string, tenantId = "tenant-private", storeId = "store-private") {
	return {
		conversationId: `private-${text}-${tenantId}-${storeId}`,
		tenantId,
		storeId,
		customerId: "customer-private",
		text,
	};
}

function privateRuntime(composition: PrivateStoreKnowledgeComposition) {
	const faux = registerFauxProvider();
	unregisterProviders.push(faux.unregister);
	const resource = createPiEnterpriseRuntimeFactory(
		{ model: faux.getModel(), streamFn: streamSimple },
		composition,
	)(undefined as never);
	return { faux, runtime: resource.runtime };
}

describe("Pilot private store knowledge composition", () => {
	it("keeps portfolio as the default and fails private configuration before Pi bootstrap", async () => {
		expect(enterpriseKnowledgeModeFromEnv({})).toEqual({ mode: "portfolio" });
		const bootstrap = vi.fn();
		await expect(
			enterpriseRuntimeFactoryFromEnv(
				{
					ENTERPRISE_RUNTIME_MODE: "pi-real",
					ENTERPRISE_KNOWLEDGE_MODE: "private",
					PI_PROVIDER: "fake-provider",
					PI_MODEL: "fake-model",
				},
				bootstrap,
			),
		).rejects.toThrow("SUPPORT_AGENT_PRIVATE_KNOWLEDGE_DIR is required");
		expect(bootstrap).not.toHaveBeenCalled();
		await expect(
			enterpriseRuntimeFactoryFromEnv({ ENTERPRISE_KNOWLEDGE_MODE: "private" }, bootstrap),
		).rejects.toThrow("ENTERPRISE_KNOWLEDGE_MODE=private requires ENTERPRISE_RUNTIME_MODE=pi-real.");
	});

	it.each([
		["empty", []],
		["synthetic", [entry({ status: "synthetic_test_only" })]],
		["unapproved", [entry({ status: "unapproved" })]],
		["unscoped", [entry({ tenantScope: undefined, storeScope: undefined })]],
		[
			"mixed scope",
			[entry(), entry({ id: "private-second-scope", tenantScope: "tenant-other", storeScope: "store-other" })],
		],
	])("rejects a %s private corpus before any runtime is composed", (_caseName, entries) => {
		const directory = fixtureDirectory(entries);
		expect(() => loadPrivateStoreKnowledgeComposition(privateEnvironment(directory))).toThrow();
	});

	it("rejects malformed private corpus JSON", () => {
		const directory = mkdtempSync(join(tmpdir(), "private-store-knowledge-malformed-"));
		directories.push(directory);
		writeFileSync(join(directory, "entries.json"), "not-json");
		expect(() => loadPrivateStoreKnowledgeComposition(privateEnvironment(directory))).toThrow(
			"Knowledge file entries.json could not be parsed.",
		);
	});

	it("routes a scoped private FAQ through search_faq with its source provenance and no demo evidence", async () => {
		const directory = fixtureDirectory([
			entry({
				id: "private-fixture-faq",
				kind: "faq",
				title: "PRIVATE_FIXTURE_FAQ_QUERY",
				content: "PRIVATE_FIXTURE_FAQ_ANSWER",
				version: "private-faq-v7",
				sourceRef: "test://private-store-knowledge/faq-v7",
			}),
		]);
		const { faux, runtime } = privateRuntime(loadPrivateStoreKnowledgeComposition(privateEnvironment(directory)));
		faux.setResponses([
			fauxAssistantMessage(
				[
					{
						type: "toolCall",
						id: "private-faq",
						name: "search_faq",
						arguments: { query: "PRIVATE_FIXTURE_FAQ_QUERY" },
					},
				],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("MODEL_SHOULD_NOT_BE_USED"),
		]);

		const result = await runtime.run(request("PRIVATE_FIXTURE_FAQ_QUERY"));

		expect(result).toMatchObject({
			type: "answer",
			text: "PRIVATE_FIXTURE_FAQ_ANSWER",
			toolsCalled: ["search_faq"],
			evidence: [
				{
					id: "private-fixture-faq",
					kind: "faq",
					version: "private-faq-v7",
					sourceRef: "test://private-store-knowledge/faq-v7",
				},
			],
		});
		expect(JSON.stringify(result)).not.toContain("demo-");
	});

	it("preserves existing single, zero, and ambiguous governed knowledge routing for private non-FAQ entries", async () => {
		const directory = fixtureDirectory([entry()]);
		const { faux, runtime } = privateRuntime(loadPrivateStoreKnowledgeComposition(privateEnvironment(directory)));
		faux.setResponses([
			fauxAssistantMessage(
				[
					{
						type: "toolCall",
						id: "private-policy",
						name: "search_knowledge",
						arguments: { query: "PRIVATE_FIXTURE_POLICY_QUERY" },
					},
				],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("MODEL_SHOULD_NOT_BE_USED"),
		]);
		const single = await runtime.run(request("PRIVATE_FIXTURE_POLICY_QUERY"));
		expect(single).toMatchObject({
			type: "answer",
			text: "PRIVATE_FIXTURE_POLICY_CONTENT",
			toolsCalled: ["search_knowledge"],
			evidence: [
				{ id: "private-fixture-entry", version: "fixture-v1", sourceRef: "test://private-store-knowledge/fixture" },
			],
		});

		const ambiguousDirectory = fixtureDirectory([
			entry({ id: "private-ambiguity-a", title: "PRIVATE_AMBIGUITY_QUERY", content: "PRIVATE_AMBIGUITY_A" }),
			entry({ id: "private-ambiguity-b", title: "PRIVATE_AMBIGUITY_QUERY", content: "PRIVATE_AMBIGUITY_B" }),
		]);
		const ambiguousRuntime = privateRuntime(
			loadPrivateStoreKnowledgeComposition(privateEnvironment(ambiguousDirectory)),
		);
		ambiguousRuntime.faux.setResponses([
			fauxAssistantMessage(
				[
					{
						type: "toolCall",
						id: "private-ambiguous",
						name: "search_knowledge",
						arguments: { query: "PRIVATE_AMBIGUITY_QUERY" },
					},
				],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("MODEL_SHOULD_NOT_BE_USED"),
		]);
		const ambiguous = await ambiguousRuntime.runtime.run(request("PRIVATE_AMBIGUITY_QUERY"));
		expect(ambiguous.type).toBe("fallback");
		expect(ambiguous.evidence).toEqual([]);

		const noEvidenceRuntime = privateRuntime(loadPrivateStoreKnowledgeComposition(privateEnvironment(directory)));
		noEvidenceRuntime.faux.setResponses([
			fauxAssistantMessage(
				[
					{
						type: "toolCall",
						id: "private-no-evidence",
						name: "search_knowledge",
						arguments: { query: "ZERO_UNRELATED_SEARCH_TERM" },
					},
				],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("MODEL_SHOULD_NOT_BE_USED"),
		]);
		const noEvidence = await noEvidenceRuntime.runtime.run(request("ZERO_UNRELATED_SEARCH_TERM"));
		expect(noEvidence.type).toBe("fallback");
		expect(noEvidence.evidence).toEqual([]);
	});

	it("never exposes a private store FAQ outside its single admitted tenant/store scope", async () => {
		const directory = fixtureDirectory([
			entry({
				id: "private-scope-faq",
				kind: "faq",
				title: "PRIVATE_SCOPE_QUERY",
				content: "PRIVATE_SCOPE_SECRET",
			}),
		]);
		const { faux, runtime } = privateRuntime(loadPrivateStoreKnowledgeComposition(privateEnvironment(directory)));
		faux.setResponses([
			fauxAssistantMessage(
				[
					{
						type: "toolCall",
						id: "private-scope",
						name: "search_faq",
						arguments: { query: "PRIVATE_SCOPE_QUERY" },
					},
				],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("MODEL_SHOULD_NOT_BE_USED"),
		]);

		const result = await runtime.run(request("PRIVATE_SCOPE_QUERY", "tenant-other", "store-other"));
		expect(result.type).toBe("fallback");
		expect(result.evidence).toEqual([]);
		expect(result.text).not.toContain("PRIVATE_SCOPE_SECRET");
	});
});
