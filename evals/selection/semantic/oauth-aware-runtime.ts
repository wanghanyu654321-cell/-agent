import type { Api, Model } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { PiSimpleCompletionRuntime } from "../../../src/semantic-selector.ts";

export interface OAuthAwarePiModelRuntime extends PiSimpleCompletionRuntime {
	checkAuth(providerId: string): Promise<unknown | undefined>;
	getModel(providerId: string, modelId: string): Model<Api> | undefined;
}

export type OAuthAwareRuntimeBootstrap =
	| { authConfigured: false }
	| { authConfigured: true; model: Model<Api>; completionRuntime: PiSimpleCompletionRuntime };

export type OAuthAwareRuntimeFactory = () => Promise<OAuthAwarePiModelRuntime>;

/**
 * Uses Pi's public Coding Agent runtime for stored OAuth resolution. No product
 * code reads, writes, or serializes Pi credentials.
 */
export async function bootstrapOAuthAwareModelRuntime(
	providerId: string,
	modelId: string,
	createRuntime: OAuthAwareRuntimeFactory = async () => ModelRuntime.create({ refreshOnCreate: false }),
): Promise<OAuthAwareRuntimeBootstrap> {
	const runtime = await createRuntime();
	const auth = await runtime.checkAuth(providerId);
	if (!auth) return { authConfigured: false };
	const model = runtime.getModel(providerId, modelId);
	if (!model) throw new Error(`Pi 0.84.3 does not recognize ${providerId}/${modelId}.`);
	return { authConfigured: true, model, completionRuntime: runtime };
}
