import type { StreamFn } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { SupportRuntimePort } from "../http-api.ts";
import { InMemorySupportStore, SupportAgentRuntime, type SupportBusinessStore } from "../index.ts";
import { GovernedKnowledgeRetrievalService } from "../knowledge.ts";
import { portfolioDemoFaq, portfolioDemoKnowledge } from "../portfolio-demo-data.ts";
import type { EnterpriseRuntimeFactory, EnterpriseRuntimeResource } from "./application.ts";

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
		runtime = await (options.createRuntime ?? createPiModelRuntime)();
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
): Promise<EnterpriseRuntimeFactory> {
	return createPiEnterpriseRuntimeFactory(await bootstrapPiEnterpriseRuntime({ providerId, modelId }));
}

/** Uses the existing runtime, tools, Safety, retrieval, and business-store boundaries unchanged. */
export function createPiEnterpriseRuntimeFactory(resolved: ResolvedPiEnterpriseRuntime): EnterpriseRuntimeFactory {
	return (businessStore: SupportBusinessStore): EnterpriseRuntimeResource => {
		const runtime = new SupportAgentRuntime({
			model: resolved.model,
			streamFn: resolved.streamFn,
			retrieval: new GovernedKnowledgeRetrievalService(portfolioDemoKnowledge, {
				allowSyntheticTestFixtures: true,
			}),
			store: new InMemorySupportStore(),
			businessStore,
			faq: portfolioDemoFaq,
			allowSyntheticTestKnowledge: true,
		});
		return { runtime: runtime as SupportRuntimePort };
	};
}

async function createPiModelRuntime(): Promise<PiModelRuntimePublic> {
	return ModelRuntime.create({ refreshOnCreate: false });
}
