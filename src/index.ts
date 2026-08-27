import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Agent, type AgentEvent, type AgentTool, type StreamFn } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Model } from "@earendil-works/pi-ai";
import {
	convertToLlm,
	formatSkillsForPrompt,
	loadSkillsFromDir,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { decideSafety, detectSafetyRisk, type SafetyDecision, type SafetyEvidence } from "./safety.ts";

export interface SupportRequest {
	conversationId: string;
	tenantId: string;
	storeId: string;
	customerId: string;
	text: string;
	permissions?: string[];
	mayEscalate?: boolean;
	requiresEscalation?: boolean;
}

export interface RetrievalEvidence {
	id: string;
	text: string;
	safety?: SafetyEvidence;
}

export interface RetrievalService {
	search(query: string, signal: AbortSignal): Promise<RetrievalEvidence[]>;
}

export class InMemoryRetrievalService implements RetrievalService {
	private readonly evidence: RetrievalEvidence[];

	constructor(evidence: RetrievalEvidence[] = []) {
		this.evidence = evidence;
	}

	async search(query: string, signal: AbortSignal): Promise<RetrievalEvidence[]> {
		if (signal.aborted) throw new Error("Knowledge search aborted.");
		const normalized = query.trim().toLowerCase();
		return this.evidence.filter((item) => item.text.toLowerCase().includes(normalized));
	}
}

export interface SupportTicket {
	id: string;
	tenantId: string;
	storeId: string;
	summary: string;
	idempotencyKey: string;
}

export interface SupportSessionMapping {
	conversationId: string;
	tenantId: string;
	storeId: string;
	customerId: string;
	piSessionId: string;
	sessionFile?: string;
}

type StoredSession = SupportSessionMapping & {
	sessionManager?: SessionManager;
};

export class InMemorySupportStore {
	private readonly sessions = new Map<string, StoredSession>();
	private readonly tickets = new Map<string, SupportTicket>();
	private readonly ticketReservations = new Set<string>();
	private readonly handoffReservations = new Set<string>();
	private handoffs: Array<{ conversationId: string; reason: string }> = [];
	private ticketCreationAttempts = 0;

	constructor(sessionMappings: SupportSessionMapping[] = []) {
		for (const session of sessionMappings) this.sessions.set(session.conversationId, { ...session });
	}

	getSession(conversationId: string): StoredSession | undefined {
		return this.sessions.get(conversationId);
	}

	setSession(session: StoredSession): void {
		this.sessions.set(session.conversationId, session);
	}

	exportSessionMappings(): SupportSessionMapping[] {
		return [...this.sessions.values()].map(({ sessionManager: _sessionManager, ...session }) => ({ ...session }));
	}

	findTicket(tenantId: string, idempotencyKey: string): SupportTicket | undefined {
		return this.tickets.get(`${tenantId}:${idempotencyKey}`);
	}

	reserveTicket(tenantId: string, idempotencyKey: string): boolean {
		const key = `${tenantId}:${idempotencyKey}`;
		if (this.tickets.has(key) || this.ticketReservations.has(key)) return false;
		this.ticketReservations.add(key);
		return true;
	}

	releaseTicketReservation(tenantId: string, idempotencyKey: string): void {
		this.ticketReservations.delete(`${tenantId}:${idempotencyKey}`);
	}

	createTicket(ticket: SupportTicket): { ticket: SupportTicket; duplicate: boolean } {
		this.ticketCreationAttempts += 1;
		const key = `${ticket.tenantId}:${ticket.idempotencyKey}`;
		const existing = this.tickets.get(key);
		if (existing) return { ticket: existing, duplicate: true };
		this.tickets.set(key, ticket);
		this.ticketReservations.delete(key);
		return { ticket, duplicate: false };
	}

	createHandoff(conversationId: string, reason: string): void {
		this.handoffs = [...this.handoffs, { conversationId, reason }];
		this.handoffReservations.delete(conversationId);
	}

	findHandoff(conversationId: string): { conversationId: string; reason: string } | undefined {
		return this.handoffs.find((handoff) => handoff.conversationId === conversationId);
	}

	reserveHandoff(conversationId: string): boolean {
		if (this.findHandoff(conversationId) || this.handoffReservations.has(conversationId)) return false;
		this.handoffReservations.add(conversationId);
		return true;
	}

	releaseHandoffReservation(conversationId: string): void {
		this.handoffReservations.delete(conversationId);
	}

	getTickets(): SupportTicket[] {
		return [...this.tickets.values()];
	}

	getHandoffs(): Array<{ conversationId: string; reason: string }> {
		return [...this.handoffs];
	}

	getTicketCreationAttempts(): number {
		return this.ticketCreationAttempts;
	}
}

export interface FaqEntry {
	question: string;
	answer: string;
}

export interface SupportAgentLimits {
	maxAgentTurns: number;
	maxToolCalls: number;
	overallTurnTimeoutMs: number;
	perToolTimeoutMs: number;
}

export interface SupportAgentRuntimeOptions {
	model: Model<string>;
	fallbackModel?: Model<string>;
	streamFn: StreamFn;
	retrieval: RetrievalService;
	store: InMemorySupportStore;
	faq: FaqEntry[];
	sessionDirectory?: string;
	skillsDirectory?: string;
	limits?: Partial<SupportAgentLimits>;
}

export interface SupportResult {
	type: "answer" | "fallback" | "escalation";
	text: string;
	piSessionId: string;
	toolsCalled: string[];
	sessionEvents: AgentEvent[];
}

const DEFAULT_LIMITS: SupportAgentLimits = {
	maxAgentTurns: 4,
	maxToolCalls: 6,
	overallTurnTimeoutMs: 10_000,
	perToolTimeoutMs: 2_000,
};

const querySchema = Type.Object({ query: Type.String({ minLength: 1 }) }, { additionalProperties: false });
const ticketSchema = Type.Object(
	{
		summary: Type.String({ minLength: 1 }),
		idempotencyKey: Type.String({ minLength: 1 }),
	},
	{ additionalProperties: false },
);
const handoffSchema = Type.Object({ reason: Type.String({ minLength: 1 }) }, { additionalProperties: false });

function textFromMessage(message: AssistantMessage | undefined): string {
	if (!message) return "";
	return message.content
		.filter((content) => content.type === "text")
		.map((content) => content.text)
		.join("\n")
		.trim();
}

function fallback(
	text: string,
	piSessionId: string,
	toolsCalled: string[],
	sessionEvents: AgentEvent[],
): SupportResult {
	return { type: "fallback", text, piSessionId, toolsCalled, sessionEvents };
}

function hasPermission(request: SupportRequest, permission: string): boolean {
	return request.permissions?.includes(permission) ?? false;
}

function hasUnsafeSideEffectPromise(text: string): boolean {
	return /已退款|已取消|已修改|已完成退款|退款.*已完成/.test(text);
}

function hasSupportFactualClaim(text: string): boolean {
	return /营业|退款|预约|订单|价格|费用|工作日|小时|政策|规则/.test(text);
}

function createTimedOutAssistantMessage(model: Model<string>): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api: model.api,
		provider: model.provider,
		model: model.id,
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "aborted",
		errorMessage: "Customer-support overall timeout reached.",
		timestamp: Date.now(),
	};
}

export class SupportAgentRuntime {
	private readonly limits: SupportAgentLimits;
	private readonly options: SupportAgentRuntimeOptions;

	constructor(options: SupportAgentRuntimeOptions) {
		this.options = options;
		this.limits = { ...DEFAULT_LIMITS, ...options.limits };
	}

	getMappedSessionId(conversationId: string): string | undefined {
		return this.options.store.getSession(conversationId)?.piSessionId;
	}

	getSessionFile(conversationId: string): string | undefined {
		return this.options.store.getSession(conversationId)?.sessionFile;
	}

	async run(request: SupportRequest): Promise<SupportResult> {
		this.validateRequest(request);
		const sessionManager = this.getOrCreateSession(request);
		const sessionEvents: AgentEvent[] = [];
		const toolsCalled: string[] = [];
		let turns = 0;
		let toolCalls = 0;
		let timedOut = false;
		let limitReached = false;
		let escalationRequested = false;
		let toolFailed = false;
		let noKnowledgeEvidence = false;
		let verifiedKnowledgeEvidence = false;
		const safetyRisk = detectSafetyRisk(request.text);
		let safetyEvidence: SafetyEvidence[] = [];
		let safetyRetrievalQuery: string | undefined;
		let safetyDecision: SafetyDecision | undefined;
		const reservedTicketKeys = new Set<string>();
		let reservedHandoff = false;
		const abortController = new AbortController();
		let agent: Agent | undefined;
		const unsubscribeEventListeners = new Set<() => void>();
		let resolveOverallDeadline = () => {};
		const overallDeadline = new Promise<void>((resolve) => {
			resolveOverallDeadline = resolve;
		});
		const timeout = setTimeout(() => {
			timedOut = true;
			abortController.abort();
			agent?.abort();
			resolveOverallDeadline();
		}, this.limits.overallTurnTimeoutMs);

		const tools = this.createTools(
			request,
			() => {
				escalationRequested = true;
			},
			() => {
				noKnowledgeEvidence = true;
			},
			() => {
				verifiedKnowledgeEvidence = true;
			},
			(query, evidence) => {
				safetyRetrievalQuery = query;
				safetyEvidence = evidence.flatMap((item) => (item.safety ? [item.safety] : []));
			},
			abortController.signal,
		);
		const systemPrompt = this.buildSystemPrompt(request.text);
		const restoredMessages = sessionManager.buildSessionContext().messages;
		agent = new Agent({
			initialState: {
				systemPrompt,
				model: this.options.model,
				thinkingLevel: "off",
				tools,
				messages: restoredMessages,
			},
			convertToLlm,
			streamFn: this.options.streamFn,
			toolExecution: "sequential",
			beforeToolCall: async ({ toolCall, args }) => {
				toolCalls += 1;
				if (toolCalls > this.limits.maxToolCalls) {
					limitReached = true;
					return { block: true, terminate: true, reason: "Customer-support tool-call limit reached." };
				}
				if (toolCall.name === "create_ticket" && !hasPermission(request, "tickets:write")) {
					return { block: true, terminate: true, reason: "Ticket permission denied." };
				}
				if (toolCall.name === "create_ticket") {
					const idempotencyKey = (args as Static<typeof ticketSchema>).idempotencyKey;
					if (!this.options.store.reserveTicket(request.tenantId, idempotencyKey)) {
						return { block: true, terminate: true, reason: "Duplicate ticket action blocked before execution." };
					}
					reservedTicketKeys.add(idempotencyKey);
				}
				if (
					toolCall.name === "handoff_to_human" &&
					(!request.mayEscalate || !hasPermission(request, "handoff:write"))
				) {
					return { block: true, terminate: true, reason: "Escalation permission denied." };
				}
				if (toolCall.name === "handoff_to_human") {
					if (!this.options.store.reserveHandoff(request.conversationId)) {
						return { block: true, terminate: true, reason: "Duplicate human handoff blocked before execution." };
					}
					reservedHandoff = true;
				}
				return undefined;
			},
			shouldStopAfterTurn: async () => {
				if (turns >= this.limits.maxAgentTurns) {
					limitReached = true;
					return true;
				}
				return false;
			},
		});

		const persistEvent = async (event: AgentEvent) => {
			sessionEvents.push(event);
			if (event.type === "turn_start") turns += 1;
			if (event.type === "tool_execution_start") toolsCalled.push(event.toolName);
			if (event.type === "tool_execution_end" && event.isError) toolFailed = true;
			if (event.type === "message_end") {
				const message = event.message;
				if (message.role === "user" || message.role === "assistant" || message.role === "toolResult") {
					sessionManager.appendMessage(message);
				}
			}
		};
		unsubscribeEventListeners.add(agent.subscribe(persistEvent));

		const promptWithinOverallDeadline = async (target: Agent): Promise<void> => {
			const prompt = target.prompt(request.text);
			void prompt.catch(() => undefined);
			await Promise.race([prompt, overallDeadline]);
		};
		await promptWithinOverallDeadline(agent);
		let lastAssistant = [...agent.state.messages].reverse().find((message) => message.role === "assistant") as
			| AssistantMessage
			| undefined;
		if (!timedOut && lastAssistant?.stopReason === "error" && this.options.fallbackModel) {
			const fallbackAgent = new Agent({
				initialState: {
					systemPrompt,
					model: this.options.fallbackModel,
					thinkingLevel: "off",
					tools,
					messages: restoredMessages,
				},
				convertToLlm,
				streamFn: this.options.streamFn,
				toolExecution: "sequential",
				beforeToolCall: agent.beforeToolCall,
				shouldStopAfterTurn: agent.shouldStopAfterTurn,
			});
			unsubscribeEventListeners.add(fallbackAgent.subscribe(persistEvent));
			agent = fallbackAgent;
			await promptWithinOverallDeadline(agent);
			lastAssistant = [...agent.state.messages].reverse().find((message) => message.role === "assistant") as
				| AssistantMessage
				| undefined;
		}
		clearTimeout(timeout);
		if (safetyRisk) safetyDecision = decideSafety(safetyRisk, safetyEvidence, false, "pause");

		const piSessionId = sessionManager.getSessionId();
		const finish = (result: SupportResult): SupportResult => {
			if (timedOut) {
				for (const unsubscribe of unsubscribeEventListeners) unsubscribe();
				unsubscribeEventListeners.clear();
			}
			if (
				timedOut &&
				!sessionManager.getEntries().some((entry) => entry.type === "message" && entry.message.role === "assistant")
			) {
				sessionManager.appendMessage(createTimedOutAssistantMessage(this.options.model));
			}
			for (const idempotencyKey of reservedTicketKeys) {
				if (!this.options.store.findTicket(request.tenantId, idempotencyKey)) {
					this.options.store.releaseTicketReservation(request.tenantId, idempotencyKey);
				}
			}
			if (reservedHandoff && !this.options.store.findHandoff(request.conversationId)) {
				this.options.store.releaseHandoffReservation(request.conversationId);
			}
			sessionManager.appendCustomEntry("support-agent.audit", {
				conversationId: request.conversationId,
				outcome: result.type,
				toolsCalled,
				turns,
				toolCalls,
				timedOut,
				limitReached,
				escalationRequested,
				toolFailed,
				safety: safetyRisk
					? {
							riskCategory: safetyRisk,
							retrievalQuery: safetyRetrievalQuery,
							evidenceIds: safetyEvidence.map((item) => item.id),
							evidenceApprovalStatus: safetyEvidence.map((item) => item.status),
							disposition: safetyDecision?.disposition,
							handoffResult: this.options.store.findHandoff(request.conversationId) ? "created" : "not_created",
							guardResult: safetyDecision?.reason,
						}
					: undefined,
			});
			this.options.store.setSession({
				conversationId: request.conversationId,
				tenantId: request.tenantId,
				storeId: request.storeId,
				customerId: request.customerId,
				piSessionId,
				sessionFile: sessionManager.getSessionFile(),
				sessionManager,
			});
			return result;
		};
		if (timedOut) {
			return finish(
				fallback(
					"抱歉，当前处理超时，已保留记录，请稍后重试或联系人工客服。",
					piSessionId,
					toolsCalled,
					sessionEvents,
				),
			);
		}
		if (limitReached) {
			return finish(
				fallback(
					"抱歉，本次处理已达到安全执行上限，已保留记录，请联系人工客服。",
					piSessionId,
					toolsCalled,
					sessionEvents,
				),
			);
		}
		if (safetyDecision?.disposition === "escalate") {
			if (
				!this.options.store.findHandoff(request.conversationId) &&
				this.options.store.reserveHandoff(request.conversationId)
			) {
				this.options.store.createHandoff(
					request.conversationId,
					`qualified_professional_required:${safetyDecision.riskCategory}:${safetyDecision.reason}`,
				);
			}
			escalationRequested = true;
			return finish({
				type: "escalation",
				text: "当前存在需要专业确认的安全风险，请暂停当前操作并由合格专业人员跟进。",
				piSessionId,
				toolsCalled,
				sessionEvents,
			});
		}
		if (safetyDecision?.disposition === "supported") {
			const options = safetyDecision.options
				.map(
					(option, index) =>
						`${index + 1}. ${option.action}（风险：${option.risk}；预期：${option.likelyResult}）`,
				)
				.join("\n");
			return finish({
				type: "answer",
				text: `以下仅为已批准资料覆盖的选项：\n${options}`,
				piSessionId,
				toolsCalled,
				sessionEvents,
			});
		}
		if (escalationRequested) {
			return finish({
				type: "escalation",
				text: "已为您转交人工客服跟进。",
				piSessionId,
				toolsCalled,
				sessionEvents,
			});
		}
		if (request.requiresEscalation) {
			return finish(
				fallback(
					"抱歉，该问题需要人工客服处理，已保留记录，请联系人工客服。",
					piSessionId,
					toolsCalled,
					sessionEvents,
				),
			);
		}
		if (toolFailed || noKnowledgeEvidence) {
			return finish(
				fallback(
					"抱歉，当前没有足够的已验证信息可以安全答复，已保留记录，请联系人工客服。",
					piSessionId,
					toolsCalled,
					sessionEvents,
				),
			);
		}
		if (lastAssistant?.stopReason === "error" || lastAssistant?.stopReason === "aborted") {
			return finish(
				fallback("抱歉，当前服务暂时不可用，请稍后重试或联系人工客服。", piSessionId, toolsCalled, sessionEvents),
			);
		}
		const text = textFromMessage(lastAssistant);
		if (!text || text.includes("<tool") || text.includes("system prompt")) {
			return finish(
				fallback("抱歉，暂时无法安全地提供答复，请联系人工客服。", piSessionId, toolsCalled, sessionEvents),
			);
		}
		if (hasSupportFactualClaim(text) && !verifiedKnowledgeEvidence) {
			return finish(
				fallback(
					"抱歉，当前没有足够的已验证信息可以安全答复，请联系人工客服。",
					piSessionId,
					toolsCalled,
					sessionEvents,
				),
			);
		}
		if (hasUnsafeSideEffectPromise(text)) {
			return finish(
				fallback("抱歉，我无法确认该操作已经完成，请联系人工客服核实。", piSessionId, toolsCalled, sessionEvents),
			);
		}
		return finish({ type: "answer", text, piSessionId, toolsCalled, sessionEvents });
	}

	private getOrCreateSession(request: SupportRequest): SessionManager {
		const existing = this.options.store.getSession(request.conversationId);
		if (existing) {
			if (
				existing.tenantId !== request.tenantId ||
				existing.storeId !== request.storeId ||
				existing.customerId !== request.customerId
			) {
				throw new Error("Conversation identity does not match the existing support session.");
			}
			if (existing.sessionManager) return existing.sessionManager;
			if (!existing.sessionFile || !this.options.sessionDirectory) {
				throw new Error("Persistent support session mapping cannot be restored without a session directory.");
			}
			const sessionManager = SessionManager.open(existing.sessionFile, this.options.sessionDirectory, process.cwd());
			if (sessionManager.getSessionId() !== existing.piSessionId) {
				throw new Error("Persistent support session mapping does not match the Pi session file.");
			}
			this.options.store.setSession({ ...existing, sessionManager });
			return sessionManager;
		}
		const sessionManager = this.options.sessionDirectory
			? SessionManager.create(process.cwd(), this.options.sessionDirectory)
			: SessionManager.inMemory();
		this.options.store.setSession({
			conversationId: request.conversationId,
			tenantId: request.tenantId,
			storeId: request.storeId,
			customerId: request.customerId,
			piSessionId: sessionManager.getSessionId(),
			sessionFile: sessionManager.getSessionFile(),
			sessionManager,
		});
		return sessionManager;
	}

	private createTools(
		request: SupportRequest,
		onEscalate: () => void,
		onNoKnowledgeEvidence: () => void,
		onVerifiedKnowledgeEvidence: () => void,
		onSafetyEvidence: (query: string, evidence: RetrievalEvidence[]) => void,
		overallSignal: AbortSignal,
	): AgentTool[] {
		const withToolTimeout = async <T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> => {
			const controller = new AbortController();
			const signal = AbortSignal.any([overallSignal, controller.signal]);
			let timer: ReturnType<typeof setTimeout> | undefined;
			const task = operation(signal);
			const deadline = new Promise<never>((_resolve, reject) => {
				timer = setTimeout(() => {
					controller.abort();
					reject(new Error("Customer-support tool timed out."));
				}, this.limits.perToolTimeoutMs);
			});
			try {
				return await Promise.race([task, deadline]);
			} finally {
				if (timer) clearTimeout(timer);
				void task.catch(() => undefined);
			}
		};

		const searchFaq: AgentTool<typeof querySchema> = {
			name: "search_faq",
			label: "Search FAQ",
			description: "Search approved customer-support FAQ answers.",
			parameters: querySchema,
			execute: async (_id, params: Static<typeof querySchema>) =>
				withToolTimeout(async (signal) => {
					if (signal.aborted) throw new Error("FAQ search aborted.");
					const match = this.options.faq.find(
						(item) => item.question.includes(params.query) || params.query.includes(item.question),
					);
					if (match) onVerifiedKnowledgeEvidence();
					else onNoKnowledgeEvidence();
					return {
						content: [{ type: "text" as const, text: match ? match.answer : "No FAQ evidence found." }],
						details: { found: Boolean(match) },
					};
				}),
		};

		const searchKnowledge: AgentTool<typeof querySchema> = {
			name: "search_knowledge",
			label: "Search knowledge",
			description: "Search the read-only support knowledge base.",
			parameters: querySchema,
			execute: async (_id, params: Static<typeof querySchema>) =>
				withToolTimeout(async (signal) => {
					if (signal.aborted) throw new Error("Knowledge search aborted.");
					const evidence = await this.options.retrieval.search(params.query, signal);
					if (signal.aborted) throw new Error("Knowledge search aborted.");
					if (evidence.length === 0) onNoKnowledgeEvidence();
					else onVerifiedKnowledgeEvidence();
					onSafetyEvidence(params.query, evidence);
					return {
						content: [
							{
								type: "text" as const,
								text: evidence.map((item) => item.text).join("\n") || "No knowledge-base evidence found.",
							},
						],
						details: { evidenceIds: evidence.map((item) => item.id) },
					};
				}),
		};

		const createTicket: AgentTool<typeof ticketSchema> = {
			name: "create_ticket",
			label: "Create ticket",
			description: "Create one authorized support ticket using an idempotency key.",
			parameters: ticketSchema,
			executionMode: "sequential",
			execute: async (_id, params: Static<typeof ticketSchema>) =>
				withToolTimeout(async (signal) => {
					if (signal.aborted) throw new Error("Ticket creation aborted.");
					const ticket = this.options.store.createTicket({
						id: `ticket-${this.options.store.getTickets().length + 1}`,
						tenantId: request.tenantId,
						storeId: request.storeId,
						summary: params.summary,
						idempotencyKey: params.idempotencyKey,
					});
					return {
						content: [
							{
								type: "text" as const,
								text: ticket.duplicate
									? `Duplicate ticket prevented: ${ticket.ticket.id}`
									: `Ticket created: ${ticket.ticket.id}`,
							},
						],
						details: { ticketId: ticket.ticket.id, duplicate: ticket.duplicate },
					};
				}),
		};

		const handoffToHuman: AgentTool<typeof handoffSchema> = {
			name: "handoff_to_human",
			label: "Handoff to human",
			description: "Escalate an authorized customer-support case to a human.",
			parameters: handoffSchema,
			executionMode: "sequential",
			execute: async (_id, params: Static<typeof handoffSchema>) =>
				withToolTimeout(async (signal) => {
					if (signal.aborted) throw new Error("Human handoff aborted.");
					this.options.store.createHandoff(request.conversationId, params.reason);
					onEscalate();
					return {
						content: [{ type: "text" as const, text: "Human handoff created." }],
						details: { reason: params.reason },
						terminate: true,
					};
				}),
		};

		return [searchFaq, searchKnowledge, createTicket, handoffToHuman];
	}

	private validateRequest(request: SupportRequest): void {
		const requiredStrings: Array<
			keyof Pick<SupportRequest, "conversationId" | "tenantId" | "storeId" | "customerId" | "text">
		> = ["conversationId", "tenantId", "storeId", "customerId", "text"];
		for (const name of requiredStrings) {
			if (typeof request[name] !== "string" || request[name].trim().length === 0) {
				throw new Error(`Support request ${name} is required.`);
			}
		}
		if (
			request.permissions !== undefined &&
			(!Array.isArray(request.permissions) || request.permissions.some((item) => typeof item !== "string"))
		) {
			throw new Error("Support request permissions must be an array of strings.");
		}
		for (const name of ["mayEscalate", "requiresEscalation"] as const) {
			if (request[name] !== undefined && typeof request[name] !== "boolean") {
				throw new Error(`Support request ${name} must be a boolean.`);
			}
		}
	}

	private buildSystemPrompt(text: string): string {
		const skillsDirectory = this.options.skillsDirectory ?? join(process.cwd(), "skills");
		const loaded = loadSkillsFromDir({ dir: skillsDirectory, source: "project" });
		const normalizedText = text.toLowerCase();
		const matchingSkillNames = new Set<string>();
		if (normalizedText.includes("预约")) matchingSkillNames.add("appointment");
		if (normalizedText.includes("投诉")) matchingSkillNames.add("complaint");
		if (normalizedText.includes("退款")) matchingSkillNames.add("refund");
		if (normalizedText.includes("人工") || normalizedText.includes("升级")) matchingSkillNames.add("escalation");
		if (normalizedText.includes("你好") || normalizedText.includes("您好")) matchingSkillNames.add("greeting");
		if (detectSafetyRisk(text)) matchingSkillNames.add("safety-escalation");
		const matchingInstructions = loaded.skills
			.filter((skill) => matchingSkillNames.has(skill.name))
			.map((skill) => readFileSync(skill.filePath, "utf8"));
		return [
			"You are a customer-support agent. Use only the provided support tools.",
			formatSkillsForPrompt(loaded.skills),
			...matchingInstructions,
		]
			.filter((part) => part.length > 0)
			.join("\n\n");
	}
}
