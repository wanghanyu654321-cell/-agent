import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type BuiltinProvider, completeSimple, getModel } from "@earendil-works/pi-ai/compat";
import { GovernedKnowledgeRetrievalService } from "../../../src/knowledge.ts";
import { SEMANTIC_SELECTOR_PROMPT_VERSION, SEMANTIC_SELECTOR_SYSTEM_PROMPT } from "../../../src/semantic-selector.ts";
import { loadPublicBenchmarkEntries, publicBenchmarkCases } from "../../retrieval/public-benchmark.ts";

type EnvelopeContent = {
	type: string;
	text?: string;
	thinking?: string;
	id?: string;
	name?: string;
	arguments?: Record<string, unknown>;
};

export type SafeProviderErrorCategory =
	| "timeout_or_abort"
	| "authentication"
	| "authorization_or_account"
	| "usage_or_quota"
	| "model_unavailable"
	| "transport_or_network"
	| "upstream_provider"
	| "unknown";

/** Classifies an in-memory provider message without returning or persisting it. */
export function classifySafeProviderError(message: string | undefined): SafeProviderErrorCategory {
	const normalized = message?.toLowerCase() ?? "";
	if (/timeout|timed out|deadline|aborted/.test(normalized)) return "timeout_or_abort";
	if (/unauthenticated|authentication|oauth|token (?:expired|invalid)|credential/.test(normalized))
		return "authentication";
	if (/forbidden|not permitted|not authorized|account .*access|organization .*access/.test(normalized))
		return "authorization_or_account";
	if (/quota|usage limit|billing limit|available balance|out of budget/.test(normalized)) return "usage_or_quota";
	if (/model (?:not found|unavailable|unsupported)|requested model/.test(normalized)) return "model_unavailable";
	if (/econn|network|socket|dns|tls|fetch .*fail|connection (?:reset|refused)/.test(normalized))
		return "transport_or_network";
	if (/upstream|service unavailable|overloaded|provider service/.test(normalized)) return "upstream_provider";
	return "unknown";
}

export interface AssistantEnvelopeInput {
	provider: string;
	model: string;
	responseModel?: string;
	responseId?: string;
	errorMessage?: string;
	content: EnvelopeContent[];
	usage: { input: number; output: number; reasoning?: number; totalTokens: number };
	stopReason: string;
	rawStopReason?: string;
	endTurn?: boolean;
	diagnostics?: Array<{ type: string; timestamp?: number; error?: { code?: string | number; message?: string } }>;
}

export interface SanitizedAssistantEnvelope {
	provider: string;
	model: string;
	responseModel?: string;
	stopReason: string;
	rawStopReason?: string;
	endTurn?: boolean;
	errorMessagePresent: boolean;
	responseIdPresent: boolean;
	contentBlockCount: number;
	contentBlockTypes: string[];
	textBlockCount: number;
	totalTextLength: number;
	thinkingBlockCount: number;
	totalThinkingLength: number;
	usage: { input: number; output: number; reasoning?: number; totalTokens: number };
	diagnosticTypes: string[];
	diagnosticCodes: Array<string | number>;
}

export function summarizeAssistantEnvelope(message: AssistantEnvelopeInput): SanitizedAssistantEnvelope {
	const textBlocks = message.content.filter((block) => block.type === "text");
	const thinkingBlocks = message.content.filter((block) => block.type === "thinking");
	return {
		provider: message.provider,
		model: message.model,
		...(message.responseModel ? { responseModel: message.responseModel } : {}),
		stopReason: message.stopReason,
		...(message.rawStopReason ? { rawStopReason: message.rawStopReason } : {}),
		...(message.endTurn === undefined ? {} : { endTurn: message.endTurn }),
		errorMessagePresent: Boolean(message.errorMessage),
		responseIdPresent: Boolean(message.responseId),
		contentBlockCount: message.content.length,
		contentBlockTypes: message.content.map((block) => block.type),
		textBlockCount: textBlocks.length,
		totalTextLength: textBlocks.reduce((total, block) => total + (block.text?.length ?? 0), 0),
		thinkingBlockCount: thinkingBlocks.length,
		totalThinkingLength: thinkingBlocks.reduce((total, block) => total + (block.thinking?.length ?? 0), 0),
		usage: {
			input: message.usage.input,
			output: message.usage.output,
			...(message.usage.reasoning === undefined ? {} : { reasoning: message.usage.reasoning }),
			totalTokens: message.usage.totalTokens,
		},
		diagnosticTypes: (message.diagnostics ?? []).map((diagnostic) => diagnostic.type),
		diagnosticCodes: (message.diagnostics ?? [])
			.map((diagnostic) => diagnostic.error?.code)
			.filter((code): code is string | number => code !== undefined),
	};
}

function diagnosticTransport(): "auto" | "sse" {
	const requested = process.env.SEMANTIC_SELECTOR_DIAGNOSTIC_TRANSPORT;
	if (requested === undefined || requested === "auto") return "auto";
	if (requested === "sse") return "sse";
	throw new Error("SEMANTIC_SELECTOR_DIAGNOSTIC_TRANSPORT must be auto or sse.");
}

function diagnosticPhase(): "provider_error_classification" | undefined {
	const phase = process.env.SEMANTIC_SELECTOR_DIAGNOSTIC_PHASE;
	if (phase === undefined) return undefined;
	if (phase === "provider-error-classification") return "provider_error_classification";
	throw new Error("SEMANTIC_SELECTOR_DIAGNOSTIC_PHASE must be provider-error-classification when set.");
}

async function runDiagnostic(): Promise<void> {
	const provider = process.env.SEMANTIC_SELECTOR_PROVIDER;
	const modelId = process.env.SEMANTIC_SELECTOR_MODEL;
	if (!provider || !modelId) throw new Error("Set SEMANTIC_SELECTOR_PROVIDER and SEMANTIC_SELECTOR_MODEL.");
	const transport = diagnosticTransport();
	const phase = diagnosticPhase();
	const control = process.env.SEMANTIC_SELECTOR_DIAGNOSTIC_CONTROL === "1";
	if (!control && process.env.SEMANTIC_SELECTOR_DIAGNOSTIC_CONTROL !== undefined)
		throw new Error("SEMANTIC_SELECTOR_DIAGNOSTIC_CONTROL must be 1 when set.");
	const reports = join(import.meta.dirname, "reports");
	if (phase === "provider_error_classification" && (!control || transport !== "auto"))
		throw new Error("Provider-error classification requires the single normal-transport control call.");
	const reportPath = join(
		reports,
		phase === "provider_error_classification"
			? "provider-error-classification-control.json"
			: control
				? "provider-envelope-control.json"
				: `provider-envelope-${transport}.json`,
	);
	if (existsSync(reportPath)) throw new Error(`${reportPath} already exists and will not be overwritten.`);
	const model = getModel(provider as BuiltinProvider, modelId);
	if (!model) throw new Error(`Pi 0.84.3 does not recognize ${provider}/${modelId}.`);

	let caseId: string;
	let candidateCount: number;
	let systemPrompt: string;
	let request: string;
	if (control) {
		caseId = "control-return-exactly-ok";
		candidateCount = 0;
		systemPrompt = "Return exactly OK";
		request = "Return exactly OK";
	} else {
		const testCase = publicBenchmarkCases.find((candidate) => candidate.caseId === "public-01");
		if (!testCase) throw new Error("Fixed diagnostic case public-01 is unavailable.");
		const entries = loadPublicBenchmarkEntries();
		const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
		const retrieval = new GovernedKnowledgeRetrievalService(entries, { rankByRelevance: true });
		const retrieved = await retrieval.search(testCase.query, new AbortController().signal, {
			tenantId: testCase.tenantId,
			storeId: testCase.storeId,
		});
		if (retrieved.length < 2 || retrieved.length > 3)
			throw new Error("Fixed diagnostic case no longer has 2-3 candidates.");
		const candidates = retrieved.map((candidate, index) => {
			const entry = entriesById.get(candidate.id);
			if (!entry) throw new Error(`Missing governed entry for ${candidate.id}.`);
			return { label: ["A", "B", "C"][index]!, title: entry.title, content: candidate.text };
		});
		caseId = testCase.caseId;
		candidateCount = candidates.length;
		systemPrompt = SEMANTIC_SELECTOR_SYSTEM_PROMPT;
		request = JSON.stringify({ query: testCase.query, candidates });
	}
	let report: Record<string, unknown>;
	const timeoutMs = 2_000;
	const startedAt = performance.now();
	try {
		const response = await completeSimple(
			model,
			{
				systemPrompt,
				messages: [{ role: "user", content: request, timestamp: Date.now() }],
			},
			{
				timeoutMs,
				maxTokens: 32,
				maxRetries: 0,
				toolChoice: "none",
				reasoning: "minimal",
				...(transport === "sse" ? { transport: "sse" as const } : {}),
			},
		);
		report = {
			kind: "V2_3_PROVIDER_RESPONSE_ENVELOPE_DIAGNOSTIC",
			provider,
			model: modelId,
			promptVersion: SEMANTIC_SELECTOR_PROMPT_VERSION,
			transport,
			mode: control ? "control" : "selector",
			...(phase ? { phase } : {}),
			caseId,
			candidateCount,
			timeoutMs,
			elapsedMs: Math.round(performance.now() - startedAt),
			outcome: "assistant_message",
			safeErrorCategory:
				response.stopReason === "error" ? classifySafeProviderError(response.errorMessage) : undefined,
			envelope: summarizeAssistantEnvelope(response),
		};
	} catch (error) {
		report = {
			kind: "V2_3_PROVIDER_RESPONSE_ENVELOPE_DIAGNOSTIC",
			provider,
			model: modelId,
			promptVersion: SEMANTIC_SELECTOR_PROMPT_VERSION,
			transport,
			mode: control ? "control" : "selector",
			...(phase ? { phase } : {}),
			caseId,
			candidateCount,
			timeoutMs,
			elapsedMs: Math.round(performance.now() - startedAt),
			outcome: "thrown_error",
			errorType: error instanceof Error ? error.name : typeof error,
			safeErrorCategory: classifySafeProviderError(error instanceof Error ? error.message : undefined),
		};
	}
	mkdirSync(reports, { recursive: true });
	writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
	console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1]?.endsWith("diagnose-provider-envelope.ts")) {
	await runDiagnostic();
}
