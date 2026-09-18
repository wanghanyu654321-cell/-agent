import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, registerFauxProvider, streamSimple } from "@earendil-works/pi-ai/compat";
import { formatSkillsForPrompt, loadSkillsFromDir } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import {
	AGENT_TOOL_NAMES,
	type AgentProfile,
	AgentProfileValidationError,
	type AgentToolName,
	DEFAULT_AGENT_PROFILE,
	resolveAgentProfile,
} from "../src/enterprise/agent-profile.ts";
import { createPiEnterpriseRuntimeFactory } from "../src/enterprise/pi-runtime.ts";
import {
	InMemoryRetrievalService,
	InMemorySupportStore,
	type RetrievalContext,
	type RetrievalService,
	SupportAgentRuntime,
	type SupportBusinessAuditRecord,
	type SupportBusinessStore,
} from "../src/index.ts";

const registrations: Array<{ unregister(): void }> = [];
const request = {
	conversationId: "profile-conversation",
	tenantId: "tenant-a",
	storeId: "store-a",
	customerId: "customer-a",
	text: "我要投诉服务态度",
};

afterEach(() => {
	while (registrations.length > 0) registrations.pop()?.unregister();
});

describe("thin digital employee agent profile", () => {
	it("fails closed for malformed, duplicate, unsupported, or ungrounded configuration", () => {
		const invalidProfiles: AgentProfile[] = [
			{ ...DEFAULT_AGENT_PROFILE, id: " " },
			{ ...DEFAULT_AGENT_PROFILE, version: " " },
			{ ...DEFAULT_AGENT_PROFILE, identityPrompt: " " },
			{ ...DEFAULT_AGENT_PROFILE, workPolicy: " " },
			{ ...DEFAULT_AGENT_PROFILE, allowedSkills: ["complaint", " complaint "] },
			{ ...DEFAULT_AGENT_PROFILE, allowedTools: ["search_faq", "search_faq", "search_knowledge"] },
			{ ...DEFAULT_AGENT_PROFILE, allowedTools: ["search_faq"] },
			{
				...DEFAULT_AGENT_PROFILE,
				allowedTools: ["search_faq", "search_knowledge", "unknown" as AgentToolName],
			},
		];

		for (const profile of invalidProfiles) {
			expect(() => resolveAgentProfile(profile)).toThrow(AgentProfileValidationError);
		}
	});

	it("hashes semantic configuration deterministically without changing input arrays", () => {
		const allowedSkills = ["complaint", "refund"];
		const allowedTools: AgentProfile["allowedTools"] = ["search_knowledge", "search_faq"];
		const profile = {
			...DEFAULT_AGENT_PROFILE,
			id: " profile-a ",
			version: " v2 ",
			allowedSkills,
			allowedTools,
		};
		const reordered = {
			...profile,
			allowedSkills: ["refund", "complaint"],
			allowedTools: ["search_faq", "search_knowledge"] as AgentProfile["allowedTools"],
		};

		const resolved = resolveAgentProfile(profile);
		expect(resolved).toMatchObject({
			id: "profile-a",
			version: "v2",
			profileHash: expect.stringMatching(/^[a-f0-9]{64}$/),
		});
		expect(resolveAgentProfile(reordered).profileHash).toBe(resolved.profileHash);
		expect(allowedSkills).toEqual(["complaint", "refund"]);
		expect(allowedTools).toEqual(["search_knowledge", "search_faq"]);
	});

	it("keeps the default profile equivalent to the predecessor prompt and complete tool/skill set", async () => {
		const faux = registerFauxProvider();
		registrations.push(faux);
		const loaded = loadSkillsFromDir({ dir: join(process.cwd(), "skills"), source: "project" });
		const expectedPrompt = [
			"You are a customer-support agent. Use only the provided support tools.",
			formatSkillsForPrompt(loaded.skills),
			...loaded.skills
				.filter((skill) => skill.name === "complaint")
				.map((skill) => readFileSync(skill.filePath, "utf8")),
		]
			.filter((part) => part.length > 0)
			.join("\n\n");
		let receivedPrompt: string | undefined;
		let receivedTools: string[] | undefined;
		faux.setResponses([
			(context) => {
				receivedPrompt = context.systemPrompt;
				receivedTools = context.tools?.map((tool) => tool.name);
				return fauxAssistantMessage("已收到您的投诉，我会协助您处理。");
			},
		]);

		await createRuntime(faux).run(request);

		expect(receivedPrompt).toBe(expectedPrompt);
		expect(receivedTools).toEqual([...AGENT_TOOL_NAMES]);
		expect([...DEFAULT_AGENT_PROFILE.allowedSkills].sort()).toEqual(loaded.skills.map((skill) => skill.name).sort());
		expect(DEFAULT_AGENT_PROFILE.allowedTools).toEqual(AGENT_TOOL_NAMES);
	});

	it("adds identity and work policy while filtering Skills before index and routed body", async () => {
		const faux = registerFauxProvider();
		registrations.push(faux);
		let receivedPrompt: string | undefined;
		let receivedTools: string[] | undefined;
		faux.setResponses([
			(context) => {
				receivedPrompt = context.systemPrompt;
				receivedTools = context.tools?.map((tool) => tool.name);
				return fauxAssistantMessage("已收到您的投诉，我会协助您处理。");
			},
		]);
		const skillsDirectory = createSkillsDirectory();
		try {
			await createRuntime(faux, {
				skillsDirectory,
				agentProfile: {
					id: "returns-specialist",
					version: "v1",
					identityPrompt: "You are the returns specialist.",
					workPolicy: "Escalate only after grounding.",
					allowedSkills: ["complaint"],
					allowedTools: ["search_faq", "search_knowledge"],
				},
			}).run(request);
		} finally {
			rmSync(skillsDirectory, { recursive: true, force: true });
		}
		expect(receivedPrompt).toContain("You are a customer-support agent. Use only the provided support tools.");
		expect(receivedPrompt).toContain("You are the returns specialist.");
		expect(receivedPrompt).toContain("Escalate only after grounding.");
		expect(receivedPrompt).toContain("name: complaint");
		expect(receivedPrompt).toContain("Complaint instructions.");
		expect(receivedPrompt).not.toContain("name: refund");
		expect(receivedPrompt).not.toContain("Refund instructions.");
		expect(receivedTools).toEqual(["search_faq", "search_knowledge"]);
	});

	it("accepts a profile only through the server-side Pi composition factory", async () => {
		const faux = registerFauxProvider();
		registrations.push(faux);
		let receivedPrompt: string | undefined;
		faux.setResponses([
			(context) => {
				receivedPrompt = context.systemPrompt;
				return fauxAssistantMessage("已收到您的投诉，我会协助您处理。");
			},
		]);
		const resource = createPiEnterpriseRuntimeFactory({ model: faux.getModel(), streamFn: streamSimple })(
			undefined as never,
			profileEvidenceRetrieval(),
			{
				id: "composed-profile",
				version: "v1",
				identityPrompt: "You are the composed specialist.",
				workPolicy: "Use only grounded evidence.",
				allowedSkills: ["complaint"],
				allowedTools: ["search_faq", "search_knowledge"],
			},
		);

		await resource.runtime.run(request);

		expect(receivedPrompt).toContain("You are the composed specialist.");
		expect(receivedPrompt).toContain("Use only grounded evidence.");
	});

	it("rejects a configured Skill that cannot be loaded", async () => {
		const faux = registerFauxProvider();
		registrations.push(faux);
		const runtime = createRuntime(faux, {
			agentProfile: { ...DEFAULT_AGENT_PROFILE, allowedSkills: ["missing-skill"] },
		});

		await expect(runtime.run(request)).rejects.toThrow("Agent profile references unavailable Skills");
	});

	it("structurally removes disallowed tools without bypassing operator authority", async () => {
		const faux = registerFauxProvider();
		registrations.push(faux);
		let receivedTools: string[] | undefined;
		faux.setResponses([
			(context) => {
				receivedTools = context.tools?.map((tool) => tool.name);
				return fauxAssistantMessage(
					[
						{
							type: "toolCall",
							id: "profile-ticket",
							name: "create_ticket",
							arguments: { summary: "refund", idempotencyKey: "profile-ticket" },
						},
					],
					{ stopReason: "toolUse" },
				);
			},
		]);
		const store = new InMemorySupportStore();
		const result = await createRuntime(faux, {
			store,
			agentProfile: { ...DEFAULT_AGENT_PROFILE, allowedTools: ["search_faq", "search_knowledge"] },
		}).run({ ...request, permissions: ["tickets:write"], mayEscalate: true });

		expect(receivedTools).toEqual(["search_faq", "search_knowledge"]);
		expect(result.type).toBe("fallback");
		expect(store.getTickets()).toEqual([]);
	});

	it("keeps retrieval scope limited to tenant and store", async () => {
		const faux = registerFauxProvider();
		registrations.push(faux);
		faux.setResponses([fauxAssistantMessage("无法确认。")]);
		const contexts: Array<RetrievalContext | undefined> = [];
		const retrieval: RetrievalService = {
			async search(_query, _signal, context) {
				contexts.push(context);
				return [];
			},
		};

		await createRuntime(faux, {
			retrieval,
			agentProfile: { ...DEFAULT_AGENT_PROFILE, id: "scoped-agent" },
		}).run(request);

		expect(contexts).toContainEqual({ tenantId: "tenant-a", storeId: "store-a" });
		expect(
			contexts.every(
				(context) =>
					Object.keys(context ?? {})
						.sort()
						.join(",") === "storeId,tenantId",
			),
		).toBe(true);
	});

	it("persists profile identity in session mappings and rejects a profile mismatch on reuse", async () => {
		const faux = registerFauxProvider();
		registrations.push(faux);
		faux.setResponses([fauxAssistantMessage("无法确认。"), fauxAssistantMessage("无法确认。")]);
		const store = new InMemorySupportStore();
		await createRuntime(faux, { store }).run(request);
		expect(store.exportSessionMappings()).toEqual([
			expect.objectContaining({
				agentProfileId: DEFAULT_AGENT_PROFILE.id,
				agentProfileVersion: DEFAULT_AGENT_PROFILE.version,
				agentProfileHash: resolveAgentProfile(DEFAULT_AGENT_PROFILE).profileHash,
			}),
		]);

		await expect(createRuntime(faux, { store }).run({ ...request, text: "第二次咨询" })).resolves.toMatchObject({
			piSessionId: expect.any(String),
		});
		for (const agentProfile of [
			{ ...DEFAULT_AGENT_PROFILE, id: "different-id" },
			{ ...DEFAULT_AGENT_PROFILE, version: "v2" },
			{ ...DEFAULT_AGENT_PROFILE, workPolicy: "Different approved policy." },
		]) {
			await expect(
				createRuntime(faux, { store, agentProfile }).run({ ...request, text: "第三次咨询" }),
			).rejects.toThrow("Active agent profile does not match the existing support session.");
		}
	});

	it("records the resolved profile identity and hash in the existing audit schema", async () => {
		const faux = registerFauxProvider();
		registrations.push(faux);
		faux.setResponses([fauxAssistantMessage("无法确认。")]);
		const audits: SupportBusinessAuditRecord[] = [];
		const businessStore = {
			async recordAudit(record: SupportBusinessAuditRecord) {
				audits.push(record);
			},
		} as unknown as SupportBusinessStore;
		const profile = { ...DEFAULT_AGENT_PROFILE, id: "audited-agent", version: "v9" };

		await createRuntime(faux, { businessStore, agentProfile: profile }).run(request);

		expect(audits).toEqual([
			expect.objectContaining({
				payload: expect.objectContaining({
					schemaVersion: "support-agent-audit-v1",
					agentProfileId: "audited-agent",
					agentProfileVersion: "v9",
					agentProfileHash: resolveAgentProfile(profile).profileHash,
				}),
			}),
		]);
		expect(audits[0]?.payload).not.toHaveProperty("identityPrompt");
		expect(audits[0]?.payload).not.toHaveProperty("workPolicy");
		expect(audits[0]?.payload).not.toHaveProperty("allowedSkills");
		expect(audits[0]?.payload).not.toHaveProperty("allowedTools");
	});
});

function createRuntime(
	faux: ReturnType<typeof registerFauxProvider>,
	options: {
		store?: InMemorySupportStore;
		retrieval?: RetrievalService;
		businessStore?: SupportBusinessStore;
		skillsDirectory?: string;
		agentProfile?: AgentProfile;
	} = {},
): SupportAgentRuntime {
	return new SupportAgentRuntime({
		model: faux.getModel(),
		streamFn: streamSimple,
		retrieval: options.retrieval ?? profileEvidenceRetrieval(),
		store: options.store ?? new InMemorySupportStore(),
		businessStore: options.businessStore,
		faq: [],
		skillsDirectory: options.skillsDirectory,
		agentProfile: options.agentProfile,
		allowSyntheticTestKnowledge: true,
	});
}

function profileEvidenceRetrieval(): InMemoryRetrievalService {
	return new InMemoryRetrievalService([
		{
			id: "profile-policy-evidence",
			text: "Approved profile test policy.",
			knowledge: {
				kind: "policy",
				status: "synthetic_test_only",
				version: "test-v1",
				sourceRef: "test://agent-profile-policy",
			},
		},
	]);
}

function createSkillsDirectory(): string {
	const directory = mkdtempSync(join(tmpdir(), "agent-profile-skills-"));
	for (const [name, instructions] of [
		["complaint", "Complaint instructions."],
		["refund", "Refund instructions."],
	]) {
		const skillDirectory = join(directory, name);
		mkdirSync(skillDirectory, { recursive: true });
		writeFileSync(
			join(skillDirectory, "SKILL.md"),
			`---\nname: ${name}\ndescription: ${name} skill.\n---\n\n${instructions}\n`,
		);
	}
	return directory;
}
