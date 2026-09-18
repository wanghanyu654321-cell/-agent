import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, registerFauxProvider, streamSimple } from "@earendil-works/pi-ai/compat";
import { type CustomEntry, SessionManager } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import {
	InMemorySupportStore,
	type RetrievalEvidence,
	type RetrievalService,
	SupportAgentRuntime,
} from "../src/index.ts";

const registrations: Array<{ unregister(): void }> = [];

afterEach(() => {
	while (registrations.length > 0) registrations.pop()?.unregister();
});

function governedEvidence(
	id: string,
	text: string,
	overrides: Partial<NonNullable<RetrievalEvidence["knowledge"]>> = {},
): RetrievalEvidence {
	return {
		id,
		text,
		knowledge: {
			kind: "policy",
			status: "approved",
			version: `${id}-v1`,
			sourceRef: `test://${id}`,
			...overrides,
		},
	};
}

async function runKnowledge(rawEvidence: RetrievalEvidence[], text = "请说明受控政策") {
	const directory = mkdtempSync(join(tmpdir(), "bounded-routing-"));
	const faux = registerFauxProvider();
	registrations.push(faux);
	faux.setResponses([
		fauxAssistantMessage(
			[{ type: "toolCall", id: "knowledge", name: "search_knowledge", arguments: { query: "受控政策" } }],
			{ stopReason: "toolUse" },
		),
		fauxAssistantMessage("UNTRUSTED_PROVIDER_FACT"),
	]);
	const retrieval: RetrievalService = { search: async () => rawEvidence };
	const runtime = new SupportAgentRuntime({
		model: faux.getModel(),
		streamFn: streamSimple,
		retrieval,
		store: new InMemorySupportStore(),
		faq: [],
		sessionDirectory: directory,
	});
	const result = await runtime.run({
		conversationId: "bounded-routing",
		tenantId: "tenant-a",
		storeId: "store-a",
		customerId: "customer-a",
		text,
	});
	const entries = SessionManager.open(
		runtime.getSessionFile("bounded-routing")!,
		directory,
		process.cwd(),
	).getEntries();
	const audit = entries.find(
		(entry): entry is CustomEntry => entry.type === "custom" && entry.customType === "support-agent.audit",
	)?.data;
	return { audit, directory, entries, result };
}

describe("V2.3.1 bounded runtime evidence routing", () => {
	it("keeps zero raw and zero admitted ordinary knowledge out of Pi before fallback", async () => {
		const rejected = [
			governedEvidence("cross-tenant", "CROSS_TENANT_BODY", { tenantScope: "tenant-b" }),
			governedEvidence("cross-store", "CROSS_STORE_BODY", { tenantScope: "tenant-a", storeScope: "store-b" }),
			governedEvidence("unapproved", "UNAPPROVED_BODY", { status: "unapproved" }),
			governedEvidence("retired", "RETIRED_BODY", { status: "retired" }),
			governedEvidence("synthetic", "SYNTHETIC_BODY", { status: "synthetic_test_only" }),
		];
		for (const rawEvidence of [[], rejected]) {
			const { audit, directory, entries, result } = await runKnowledge(rawEvidence);
			try {
				expect(result.type).toBe("fallback");
				expect(result.evidence).toEqual([]);
				expect(JSON.stringify(entries)).not.toMatch(
					/CROSS_TENANT_BODY|CROSS_STORE_BODY|UNAPPROVED_BODY|RETIRED_BODY|SYNTHETIC_BODY/,
				);
				expect(audit).toMatchObject({
					knowledgeRouting: {
						admittedCandidateCount: 0,
						candidateEvidenceIds: [],
						decision: "NO_CANDIDATE",
						semanticSelectorInvoked: false,
						eligibleEvidenceIds: [],
						authorizedEvidenceIds: [],
					},
				});
			} finally {
				rmSync(directory, { recursive: true, force: true });
			}
		}
	});

	it("exposes only one governed candidate and audits it as eligible and actually authorized", async () => {
		const { audit, directory, entries, result } = await runKnowledge([
			governedEvidence("accepted", "ONLY_ACCEPTED_BODY"),
			governedEvidence("rejected", "REJECTED_BODY", { status: "retired" }),
		]);
		try {
			expect(result.type).toBe("answer");
			expect(result.text).toBe("ONLY_ACCEPTED_BODY");
			expect(result.evidence).toEqual([
				{ id: "accepted", kind: "policy", version: "accepted-v1", sourceRef: "test://accepted" },
			]);
			expect(JSON.stringify(entries)).toContain("ONLY_ACCEPTED_BODY");
			expect(JSON.stringify(entries)).not.toContain("REJECTED_BODY");
			expect(audit).toMatchObject({
				knowledgeRouting: {
					admittedCandidateCount: 1,
					candidateEvidenceIds: ["accepted"],
					decision: "SINGLE_CANDIDATE",
					semanticSelectorInvoked: false,
					eligibleEvidenceIds: ["accepted"],
					authorizedEvidenceIds: ["accepted"],
				},
			});
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it.each([2, 3, 4])("fails closed before Pi exposure for %d admitted candidates", async (count) => {
		const rawEvidence = Array.from({ length: count }, (_, index) =>
			governedEvidence(`candidate-${index + 1}`, `AMBIGUOUS_BODY_${index + 1}`),
		);
		const { audit, directory, entries, result } = await runKnowledge(rawEvidence);
		try {
			expect(result.type).toBe("fallback");
			expect(result.evidence).toEqual([]);
			expect(JSON.stringify(entries)).not.toMatch(
				/AMBIGUOUS_BODY_1|AMBIGUOUS_BODY_2|AMBIGUOUS_BODY_3|AMBIGUOUS_BODY_4/,
			);
			expect(audit).toMatchObject({
				knowledgeRouting: {
					admittedCandidateCount: count,
					candidateEvidenceIds: rawEvidence.map((item) => item.id),
					decision: "AMBIGUOUS_MULTIPLE_CANDIDATES",
					semanticSelectorInvoked: false,
					eligibleEvidenceIds: [],
					authorizedEvidenceIds: [],
				},
			});
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("keeps a single ordinary candidate eligible but unauthorized when safety escalation wins", async () => {
		const safetyAndOrdinary: RetrievalEvidence = {
			...governedEvidence("ordinary", "ORDINARY_BODY"),
			safety: {
				id: "safety-escalate",
				riskCategory: "allergy",
				status: "approved",
				version: "safety-v1",
				scope: ["pause"],
				allowedOptions: [],
				requiresEscalation: true,
			},
		};
		const { audit, directory, result } = await runKnowledge([safetyAndOrdinary], "顾客可能过敏，请处理。");
		try {
			expect(result.type).toBe("escalation");
			expect(result.evidence).toEqual([]);
			expect(audit).toMatchObject({
				knowledgeRouting: {
					candidateEvidenceIds: ["ordinary"],
					decision: "SINGLE_CANDIDATE",
					eligibleEvidenceIds: ["ordinary"],
					authorizedEvidenceIds: [],
					semanticSelectorInvoked: false,
				},
				safety: { disposition: "escalate" },
			});
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("keeps FAQ on its existing pre-model admission path without ordinary routing metadata", async () => {
		const directory = mkdtempSync(join(tmpdir(), "bounded-routing-faq-"));
		const faux = registerFauxProvider();
		registrations.push(faux);
		faux.setResponses([
			fauxAssistantMessage([{ type: "toolCall", id: "faq", name: "search_faq", arguments: { query: "营业时间" } }], {
				stopReason: "toolUse",
			}),
			fauxAssistantMessage("UNTRUSTED_PROVIDER_FACT"),
		]);
		const runtime = new SupportAgentRuntime({
			model: faux.getModel(),
			streamFn: streamSimple,
			retrieval: { search: async () => [] },
			store: new InMemorySupportStore(),
			faq: [
				{
					id: "faq-approved",
					question: "营业时间",
					answer: "FAQ_APPROVED_BODY",
					status: "approved",
					version: "faq-v1",
					sourceRef: "test://faq-approved",
				},
			],
			sessionDirectory: directory,
		});
		try {
			const result = await runtime.run({
				conversationId: "bounded-routing-faq",
				tenantId: "tenant-a",
				storeId: "store-a",
				customerId: "customer-a",
				text: "营业时间",
			});
			const audit = SessionManager.open(runtime.getSessionFile("bounded-routing-faq")!, directory, process.cwd())
				.getEntries()
				.find(
					(entry): entry is CustomEntry => entry.type === "custom" && entry.customType === "support-agent.audit",
				)?.data as { knowledgeRouting?: unknown } | undefined;
			expect(result.type).toBe("answer");
			expect(result.text).toBe("FAQ_APPROVED_BODY");
			expect(audit?.knowledgeRouting).toBeUndefined();
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
