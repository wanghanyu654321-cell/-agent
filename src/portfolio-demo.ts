import { once } from "node:events";
import type { Server } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fauxAssistantMessage, registerFauxProvider, streamSimple } from "@earendil-works/pi-ai/compat";
import { createPortfolioHttpServer, type SupportRuntimePort } from "./http-api.ts";
import { InMemorySupportStore, SupportAgentRuntime, type SupportRequest, type SupportResult } from "./index.ts";
import { GovernedKnowledgeRetrievalService } from "./knowledge.ts";
import { portfolioDemoFaq, portfolioDemoKnowledge } from "./portfolio-demo-data.ts";

export const portfolioDemoDisclaimer = "DETERMINISTIC PORTFOLIO DEMO — NOT A PRODUCTION MODEL PROVIDER.";

export const portfolioDemoDefaultIdentity = {
	tenantId: "demo-tenant",
	storeId: "demo-store",
	customerId: "demo-customer",
} as const;

export type PortfolioDemoScenarioId =
	| "faq-business-hours"
	| "single-refund-timing"
	| "no-governed-evidence"
	| "ambiguous-refund-rules"
	| "safety-escalation"
	| "ticket-creation"
	| "human-handoff";

export interface PortfolioDemoScenario {
	id: PortfolioDemoScenarioId;
	title: string;
	userMessage: string;
	description: string;
	requiredPermissions: string[];
	mayEscalate: boolean;
	expectedOutcome: "answer" | "fallback" | "escalation";
}

export const portfolioDemoScenarios: readonly PortfolioDemoScenario[] = [
	{
		id: "faq-business-hours",
		title: "FAQ answer",
		userMessage: "请问门店营业时间？",
		description: "Approved synthetic FAQ evidence is returned through search_faq.",
		requiredPermissions: [],
		mayEscalate: false,
		expectedOutcome: "answer",
	},
	{
		id: "single-refund-timing",
		title: "Single governed knowledge",
		userMessage: "退款一般多久到账？",
		description: "One admitted synthetic policy record grounds the answer.",
		requiredPermissions: [],
		mayEscalate: false,
		expectedOutcome: "answer",
	},
	{
		id: "no-governed-evidence",
		title: "No governed evidence",
		userMessage: "门店有免费停车位吗？",
		description: "No matching governed evidence produces a controlled fallback.",
		requiredPermissions: [],
		mayEscalate: false,
		expectedOutcome: "fallback",
	},
	{
		id: "ambiguous-refund-rules",
		title: "Ambiguous multiple evidence",
		userMessage: "这个退款到底应该按哪个规则处理？",
		description: "Two admitted records exercise the Runtime's bounded ambiguity fail-closed path.",
		requiredPermissions: [],
		mayEscalate: false,
		expectedOutcome: "fallback",
	},
	{
		id: "safety-escalation",
		title: "Safety escalation",
		userMessage: "顾客做项目时皮肤越来越痒，我该怎么继续？",
		description: "Missing authorized safety evidence pauses and escalates through the Runtime.",
		requiredPermissions: [],
		mayEscalate: false,
		expectedOutcome: "escalation",
	},
	{
		id: "ticket-creation",
		title: "Ticket creation",
		userMessage: "帮我记录一个退款售后工单",
		description: "The Runtime executes create_ticket only when tickets:write is present.",
		requiredPermissions: ["tickets:write"],
		mayEscalate: false,
		expectedOutcome: "answer",
	},
	{
		id: "human-handoff",
		title: "Human handoff",
		userMessage: "这个投诉我需要转人工处理",
		description: "The Runtime executes handoff_to_human only with the required permission and escalation flag.",
		requiredPermissions: ["handoff:write"],
		mayEscalate: true,
		expectedOutcome: "escalation",
	},
];

export interface PortfolioDemoComposition {
	runtime: SupportAgentRuntime;
	store: InMemorySupportStore;
	server: Server;
	scenarios: readonly PortfolioDemoScenario[];
	run(request: SupportRequest): Promise<SupportResult>;
	close(): Promise<void>;
}

class SerializedDemoRuntime implements SupportRuntimePort {
	private tail: Promise<void> = Promise.resolve();
	private readonly runtime: SupportAgentRuntime;
	private readonly faux: ReturnType<typeof registerFauxProvider>;

	constructor(runtime: SupportAgentRuntime, faux: ReturnType<typeof registerFauxProvider>) {
		this.runtime = runtime;
		this.faux = faux;
	}

	run(request: SupportRequest): Promise<SupportResult> {
		const result = this.tail.then(async () => {
			configureFauxResponses(this.faux, scenarioIdForText(request.text));
			return this.runtime.run(request);
		});
		this.tail = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}

	async drain(): Promise<void> {
		await this.tail;
	}
}

export function createPortfolioDemoComposition(): PortfolioDemoComposition {
	const faux = registerFauxProvider();
	const store = new InMemorySupportStore();
	const runtime = new SupportAgentRuntime({
		model: faux.getModel(),
		streamFn: streamSimple,
		retrieval: new GovernedKnowledgeRetrievalService(portfolioDemoKnowledge, {
			allowSyntheticTestFixtures: true,
		}),
		store,
		faq: portfolioDemoFaq,
		allowSyntheticTestKnowledge: true,
	});
	const serializedRuntime = new SerializedDemoRuntime(runtime, faux);
	const server = createPortfolioHttpServer(serializedRuntime);
	return {
		runtime,
		store,
		server,
		scenarios: portfolioDemoScenarios,
		run: (request) => serializedRuntime.run(request),
		async close() {
			await serializedRuntime.drain();
			if (server.listening) {
				await new Promise<void>((resolveClose, rejectClose) => {
					server.close((error) => (error ? rejectClose(error) : resolveClose()));
				});
			}
			faux.unregister();
		},
	};
}

export function resolvePortfolioDemoPort(value: string | undefined): number {
	if (value === undefined || value === "") return 3000;
	if (!/^[1-9]\d*$/.test(value)) throw new Error("PORT must be a valid integer TCP port.");
	const port = Number(value);
	if (!Number.isSafeInteger(port) || port > 65_535) throw new Error("PORT must be a valid integer TCP port.");
	return port;
}

export async function startPortfolioDemo(): Promise<PortfolioDemoComposition> {
	const composition = createPortfolioDemoComposition();
	const port = resolvePortfolioDemoPort(process.env.PORT);
	composition.server.listen(port, "127.0.0.1");
	await once(composition.server, "listening");

	let shuttingDown = false;
	const shutdown = () => {
		if (shuttingDown) return;
		shuttingDown = true;
		void composition.close().finally(() => process.exit(0));
	};
	process.once("SIGINT", shutdown);
	process.once("SIGTERM", shutdown);
	console.log("Customer Support Agent Portfolio Demo");
	console.log(`http://127.0.0.1:${port}`);
	return composition;
}

function scenarioIdForText(text: string): PortfolioDemoScenarioId | "unknown" {
	if (text.includes("营业时间")) return "faq-business-hours";
	if (text.includes("退款一般多久到账")) return "single-refund-timing";
	if (text.includes("免费停车位")) return "no-governed-evidence";
	if (text.includes("这个退款到底应该按哪个规则处理")) return "ambiguous-refund-rules";
	if (text.includes("皮肤越来越痒")) return "safety-escalation";
	if (text.includes("帮我记录一个退款售后工单")) return "ticket-creation";
	if (text.includes("这个投诉我需要转人工处理")) return "human-handoff";
	return "unknown";
}

function configureFauxResponses(
	faux: ReturnType<typeof registerFauxProvider>,
	scenario: PortfolioDemoScenarioId | "unknown",
): void {
	switch (scenario) {
		case "faq-business-hours":
			faux.setResponses([
				fauxAssistantMessage(
					[{ type: "toolCall", id: "demo-faq", name: "search_faq", arguments: { query: "营业时间" } }],
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage("Deterministic demo FAQ completion."),
			]);
			return;
		case "single-refund-timing":
			faux.setResponses([
				fauxAssistantMessage(
					[
						{
							type: "toolCall",
							id: "demo-timing",
							name: "search_knowledge",
							arguments: { query: "退款多久到账" },
						},
					],
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage("Deterministic demo knowledge completion."),
			]);
			return;
		case "no-governed-evidence":
		case "unknown":
			faux.setResponses([
				fauxAssistantMessage(
					[
						{
							type: "toolCall",
							id: "demo-no-evidence",
							name: "search_knowledge",
							arguments: { query: scenario === "unknown" ? "unknown demo request" : "免费停车位" },
						},
					],
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage("Deterministic demo has no verified answer."),
			]);
			return;
		case "ambiguous-refund-rules":
			faux.setResponses([
				fauxAssistantMessage(
					[
						{
							type: "toolCall",
							id: "demo-ambiguous",
							name: "search_knowledge",
							arguments: { query: "退款按哪个规则" },
						},
					],
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage("Deterministic demo ambiguity completion."),
			]);
			return;
		case "safety-escalation":
			faux.setResponses([
				fauxAssistantMessage(
					[
						{
							type: "toolCall",
							id: "demo-safety",
							name: "search_knowledge",
							arguments: { query: "allergy pause" },
						},
					],
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage("Deterministic demo safety completion."),
			]);
			return;
		case "ticket-creation":
			faux.setResponses([
				fauxAssistantMessage(
					[
						{
							type: "toolCall",
							id: "demo-ticket",
							name: "create_ticket",
							arguments: {
								summary: "Demo refund after-sales request",
								idempotencyKey: "demo-refund-ticket",
							},
						},
					],
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage("已为您记录售后工单。"),
			]);
			return;
		case "human-handoff":
			faux.setResponses([
				fauxAssistantMessage(
					[
						{
							type: "toolCall",
							id: "demo-handoff",
							name: "handoff_to_human",
							arguments: { reason: "Demo complaint requires human handling" },
						},
					],
					{ stopReason: "toolUse" },
				),
			]);
			return;
	}
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
	void startPortfolioDemo().catch(() => {
		console.error("Customer Support Agent Portfolio Demo failed to start.");
		process.exitCode = 1;
	});
}
