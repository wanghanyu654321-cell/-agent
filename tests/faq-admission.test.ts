import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, registerFauxProvider, streamSimple } from "@earendil-works/pi-ai/compat";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { type FaqEntry, InMemoryRetrievalService, InMemorySupportStore, SupportAgentRuntime } from "../src/index.ts";

const registrations: Array<{ unregister(): void }> = [];

afterEach(() => {
	while (registrations.length > 0) registrations.pop()?.unregister();
});

function faq(overrides: Partial<FaqEntry> = {}): FaqEntry {
	return {
		id: "faq-default",
		question: "受控 FAQ",
		answer: "APPROVED_FAQ_CONTENT",
		status: "approved",
		version: "faq-v1",
		sourceRef: "test://faq-default",
		...overrides,
	};
}

async function runFaq(
	faqs: FaqEntry[],
	options: { tenantId?: string; storeId?: string; allowSyntheticTestKnowledge?: boolean } = {},
) {
	const directory = mkdtempSync(join(tmpdir(), "faq-admission-"));
	const faux = registerFauxProvider();
	registrations.push(faux);
	faux.setResponses([
		fauxAssistantMessage(
			[{ type: "toolCall", id: "faq-tool", name: "search_faq", arguments: { query: "受控 FAQ" } }],
			{ stopReason: "toolUse" },
		),
		fauxAssistantMessage("MODEL_INVENTED_FAQ_RESPONSE"),
	]);
	const store = new InMemorySupportStore();
	const runtime = new SupportAgentRuntime({
		model: faux.getModel(),
		streamFn: streamSimple,
		retrieval: new InMemoryRetrievalService(),
		store,
		faq: faqs,
		sessionDirectory: directory,
		allowSyntheticTestKnowledge: options.allowSyntheticTestKnowledge,
	});
	const result = await runtime.run({
		conversationId: "faq-admission",
		tenantId: options.tenantId ?? "tenant-a",
		storeId: options.storeId ?? "store-a",
		customerId: "customer-a",
		text: "请说明受控 FAQ",
	});
	const sessionFile = runtime.getSessionFile("faq-admission");
	if (!sessionFile) throw new Error("Missing FAQ session file.");
	const entries = SessionManager.open(sessionFile, directory, process.cwd()).getEntries();
	return { directory, entries, result };
}

describe("V2.0.1 FAQ pre-model admission", () => {
	it.each([
		["global", faq()],
		["tenant", faq({ tenantScope: "tenant-a" })],
		["store", faq({ tenantScope: "tenant-a", storeScope: "store-a" })],
	])("returns an approved %s FAQ", async (_scope, entry) => {
		const { directory, result } = await runFaq([entry]);
		try {
			expect(result.type).toBe("answer");
			expect(result.text).toBe("APPROVED_FAQ_CONTENT");
			expect(result.evidence).toEqual([
				{ id: "faq-default", kind: "faq", version: "faq-v1", sourceRef: "test://faq-default" },
			]);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it.each([
		["cross-tenant", faq({ answer: "TENANT_B_SECRET", tenantScope: "tenant-b" })],
		["cross-store", faq({ answer: "STORE_B_SECRET", tenantScope: "tenant-a", storeScope: "store-b" })],
		["unapproved", faq({ answer: "UNAPPROVED_SECRET", status: "unapproved" })],
		["retired", faq({ answer: "RETIRED_SECRET", status: "retired" })],
		["synthetic production", faq({ answer: "SYNTHETIC_SECRET", status: "synthetic_test_only" })],
	])("rejects %s FAQ before its content reaches the Pi session", async (_reason, entry) => {
		const { directory, entries, result } = await runFaq([entry]);
		try {
			expect(result.type).toBe("fallback");
			expect(result.text).not.toContain(entry.answer);
			expect(JSON.stringify(entries)).not.toContain(entry.answer);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("allows synthetic FAQ only in an explicit test runtime", async () => {
		const { directory, result } = await runFaq(
			[faq({ answer: "SYNTHETIC_TEST_CONTENT", status: "synthetic_test_only" })],
			{ allowSyntheticTestKnowledge: true },
		);
		try {
			expect(result.type).toBe("answer");
			expect(result.text).toBe("SYNTHETIC_TEST_CONTENT");
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("selects an authorized second candidate and persists only its correct evidence and audit trace", async () => {
		const unauthorizedFirst = faq({
			id: "faq-tenant-b",
			answer: "TENANT_B_SECRET",
			tenantScope: "tenant-b",
			version: "tenant-b-v1",
			sourceRef: "test://tenant-b",
		});
		const authorizedSecond = faq({
			id: "faq-tenant-a",
			answer: "TENANT_A_APPROVED",
			tenantScope: "tenant-a",
			version: "tenant-a-v2",
			sourceRef: "test://tenant-a",
		});
		const { directory, entries, result } = await runFaq([unauthorizedFirst, authorizedSecond]);
		try {
			expect(result.type).toBe("answer");
			expect(result.text).toBe("TENANT_A_APPROVED");
			expect(result.evidence).toEqual([
				{ id: "faq-tenant-a", kind: "faq", version: "tenant-a-v2", sourceRef: "test://tenant-a" },
			]);
			expect(JSON.stringify(entries)).not.toContain("TENANT_B_SECRET");
			expect(JSON.stringify(entries)).toContain("TENANT_A_APPROVED");
			const audit = entries.find((entry) => entry.type === "custom" && entry.customType === "support-agent.audit");
			expect(audit).toMatchObject({
				data: {
					grounding: {
						admissible: true,
						evidence: [{ id: "faq-tenant-a", version: "tenant-a-v2", sourceRef: "test://tenant-a" }],
					},
				},
			});
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("fails closed when FAQ candidates exist but none are admissible", async () => {
		const { directory, result } = await runFaq([
			faq({ answer: "UNAPPROVED_SECRET", status: "unapproved" }),
			faq({ id: "retired", answer: "RETIRED_SECRET", status: "retired" }),
		]);
		try {
			expect(result.type).toBe("fallback");
			expect(result.evidence).toEqual([]);
			expect(result.text).not.toContain("UNAPPROVED_SECRET");
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
