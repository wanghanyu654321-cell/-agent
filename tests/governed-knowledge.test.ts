import { describe, expect, it } from "vitest";
import { GovernedKnowledgeRetrievalService, type KnowledgeEntry, validateKnowledgeEntries } from "../src/knowledge.ts";

const approvedGlobal: KnowledgeEntry = {
	id: "fixture-global-faq",
	kind: "faq",
	status: "approved",
	title: "受控 FAQ",
	content: "受控业务事实。",
	version: "fixture-v1",
	updatedAt: "2026-08-28",
	sourceRef: "test://fixture-global-faq",
	tags: ["受控", "faq"],
};

const approvedTenant: KnowledgeEntry = {
	...approvedGlobal,
	id: "fixture-tenant-policy",
	kind: "policy",
	title: "租户范围政策",
	content: "租户范围的受控业务事实。",
	tenantScope: "tenant-a",
	sourceRef: "test://fixture-tenant-policy",
};

const approvedStore: KnowledgeEntry = {
	...approvedTenant,
	id: "fixture-store-sop",
	kind: "sop",
	title: "门店范围非专业 SOP",
	content: "门店范围的受控业务事实。",
	storeScope: "store-a1",
	sourceRef: "test://fixture-store-sop",
};

describe("governed general knowledge", () => {
	it("admits only approved entries for a production request and preserves trace metadata", async () => {
		const retrieval = new GovernedKnowledgeRetrievalService([
			approvedGlobal,
			approvedTenant,
			approvedStore,
			{ ...approvedGlobal, id: "synthetic", status: "synthetic_test_only", sourceRef: "test://synthetic" },
			{ ...approvedGlobal, id: "unapproved", status: "unapproved", sourceRef: "test://unapproved" },
			{ ...approvedGlobal, id: "retired", status: "retired", sourceRef: "test://retired" },
		]);

		const evidence = await retrieval.search("受控", new AbortController().signal, {
			tenantId: "tenant-a",
			storeId: "store-a1",
		});

		expect(evidence.map((item) => item.id)).toEqual([
			"fixture-global-faq",
			"fixture-tenant-policy",
			"fixture-store-sop",
		]);
		expect(evidence[0]?.knowledge).toEqual({
			kind: "faq",
			status: "approved",
			version: "fixture-v1",
			sourceRef: "test://fixture-global-faq",
		});
	});

	it("rejects synthetic entries in production while allowing them only through an explicit test option", async () => {
		const synthetic = { ...approvedGlobal, id: "synthetic", status: "synthetic_test_only" as const };
		const production = new GovernedKnowledgeRetrievalService([synthetic]);
		const testOnly = new GovernedKnowledgeRetrievalService([synthetic], { allowSyntheticTestFixtures: true });
		const scope = { tenantId: "tenant-a", storeId: "store-a1" };

		await expect(production.search("受控", new AbortController().signal, scope)).resolves.toEqual([]);
		await expect(testOnly.search("受控", new AbortController().signal, scope)).resolves.toMatchObject([
			{ id: "synthetic", knowledge: { status: "synthetic_test_only" } },
		]);
	});

	it("never leaks tenant or store scoped entries outside their explicit metadata scope", async () => {
		const retrieval = new GovernedKnowledgeRetrievalService([approvedGlobal, approvedTenant, approvedStore]);
		const sameTenantOtherStore = await retrieval.search("受控", new AbortController().signal, {
			tenantId: "tenant-a",
			storeId: "store-a2",
		});
		const otherTenant = await retrieval.search("受控", new AbortController().signal, {
			tenantId: "tenant-b",
			storeId: "store-b1",
		});

		expect(sameTenantOtherStore.map((item) => item.id)).toEqual(["fixture-global-faq", "fixture-tenant-policy"]);
		expect(otherTenant.map((item) => item.id)).toEqual(["fixture-global-faq"]);
	});

	it("rejects malformed and duplicate knowledge at construction", () => {
		expect(() => validateKnowledgeEntries([{ ...approvedGlobal, id: "" }])).toThrow("id is required");
		expect(() => validateKnowledgeEntries([{ ...approvedGlobal, content: "  " }])).toThrow("content is required");
		expect(() => validateKnowledgeEntries([{ ...approvedGlobal, status: "unknown" as never }])).toThrow(
			"unsupported status",
		);
		expect(() => validateKnowledgeEntries([{ ...approvedGlobal, kind: "unknown" as never }])).toThrow(
			"unsupported kind",
		);
		expect(() => validateKnowledgeEntries([{ ...approvedGlobal, updatedAt: "not-a-date" }])).toThrow(
			"updatedAt must be an ISO date",
		);
		expect(() => validateKnowledgeEntries([approvedGlobal, { ...approvedGlobal }])).toThrow("duplicate id");
	});
});
