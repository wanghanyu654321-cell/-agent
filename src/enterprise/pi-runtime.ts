import type { StreamFn } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { SupportRuntimePort } from "../http-api.ts";
import {
	type FaqEntry,
	InMemorySupportStore,
	type RetrievalService,
	SupportAgentRuntime,
	type SupportBusinessStore,
} from "../index.ts";
import { GovernedKnowledgeRetrievalService } from "../knowledge.ts";
import { portfolioDemoFaq, portfolioDemoKnowledge } from "../portfolio-demo-data.ts";
import { type AgentProfile, DEFAULT_AGENT_PROFILE } from "./agent-profile.ts";
import type { EnterpriseRuntimeFactory, EnterpriseRuntimeResource } from "./application.ts";
import { configureDeepSeek } from "./deepseek-provider.ts";

export interface PiModelRuntimePublic {
	checkAuth(providerId: string): Promise<unknown | undefined>;
	getModel(providerId: string, modelId: string): Model<Api> | undefined;
	streamSimple: StreamFn;
}

export interface PiEnterpriseRuntimeBootstrapOptions {
	providerId: string;
	modelId: string;
	createRuntime?: () => Promise<PiModelRuntimePublic>;
}

export interface ResolvedPiEnterpriseRuntime {
	model: Model<Api>;
	streamFn: StreamFn;
}

export interface PiEnterpriseKnowledgeComposition {
	faq: FaqEntry[];
	knowledge: typeof portfolioDemoKnowledge;
	allowSyntheticTestFixtures: boolean;
	allowSyntheticTestKnowledge: boolean;
}

export class PiEnterpriseRuntimeStartupError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PiEnterpriseRuntimeStartupError";
	}
}

/**
 * Resolves provider authentication solely through Pi's public ModelRuntime.
 * Credentials remain within Pi and are never surfaced to product code.
 */
export async function bootstrapPiEnterpriseRuntime(
	options: PiEnterpriseRuntimeBootstrapOptions,
): Promise<ResolvedPiEnterpriseRuntime> {
	let runtime: PiModelRuntimePublic;
	try {
		runtime = await (options.createRuntime ?? (() => createPiModelRuntime(options.providerId, options.modelId)))();
	} catch {
		throw new PiEnterpriseRuntimeStartupError("Pi provider initialization failed.");
	}

	let authConfigured: unknown;
	try {
		authConfigured = await runtime.checkAuth(options.providerId);
	} catch {
		throw new PiEnterpriseRuntimeStartupError("Pi provider authentication could not be verified.");
	}
	if (!authConfigured) throw new PiEnterpriseRuntimeStartupError("Pi provider authentication is not configured.");

	let model: Model<Api> | undefined;
	try {
		model = runtime.getModel(options.providerId, options.modelId);
	} catch {
		throw new PiEnterpriseRuntimeStartupError("Pi provider/model is unavailable.");
	}
	if (!model) throw new PiEnterpriseRuntimeStartupError("Pi provider/model is unavailable.");

	return { model, streamFn: runtime.streamSimple.bind(runtime) };
}

export async function bootstrapPiEnterpriseRuntimeFactory(
	providerId: string,
	modelId: string,
	knowledgeComposition: PiEnterpriseKnowledgeComposition = portfolioKnowledgeComposition(),
): Promise<EnterpriseRuntimeFactory> {
	return createPiEnterpriseRuntimeFactory(
		await bootstrapPiEnterpriseRuntime({ providerId, modelId }),
		knowledgeComposition,
	);
}

/** Uses the existing runtime, tools, Safety, retrieval, and business-store boundaries unchanged. */
export function createPiEnterpriseRuntimeFactory(
	resolved: ResolvedPiEnterpriseRuntime,
	knowledgeComposition: PiEnterpriseKnowledgeComposition = portfolioKnowledgeComposition(),
): EnterpriseRuntimeFactory {
	return (
		businessStore: SupportBusinessStore,
		retrieval?: RetrievalService,
		agentProfile: AgentProfile = DEFAULT_AGENT_PROFILE,
	): EnterpriseRuntimeResource => {
		const runtime = new SupportAgentRuntime({
			realPolicy: true,
			model: resolved.model,
			streamFn: resolved.streamFn,
			retrieval:
				retrieval ??
				new GovernedKnowledgeRetrievalService(knowledgeComposition.knowledge, {
					allowSyntheticTestFixtures: knowledgeComposition.allowSyntheticTestFixtures,
				}),
			store: new InMemorySupportStore(),
			businessStore,
			faq: knowledgeComposition.faq,
			allowSyntheticTestKnowledge: knowledgeComposition.allowSyntheticTestKnowledge,
			agentProfile,
		});
		return { runtime: runtime as SupportRuntimePort };
	};
}

function portfolioKnowledgeComposition(): PiEnterpriseKnowledgeComposition {
	return {
		faq: portfolioDemoFaq,
		knowledge: portfolioDemoKnowledge,
		allowSyntheticTestFixtures: true,
		allowSyntheticTestKnowledge: true,
	};
}

async function createPiModelRuntime(providerId: string, modelId: string): Promise<PiModelRuntimePublic> {
	const runtime = await ModelRuntime.create({
		refreshOnCreate: false,
		...(providerId === "deepseek" ? { modelsPath: null } : {}),
	});
	if (providerId === "deepseek") {
		if (modelId !== "deepseek-flash") throw new Error("Unsupported DeepSeek model.");
		configureDeepSeek(runtime);
	}
	return runtime;
}
