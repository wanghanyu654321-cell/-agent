import type { ModelRuntime } from "@earendil-works/pi-coding-agent";

/** Pi 0.84.3 has native DeepSeek auth/transport, but predates the current model name. */
export function configureDeepSeek(runtime: Pick<ModelRuntime, "registerProvider">): void {
	runtime.registerProvider("deepseek", {
		baseUrl: "https://api.deepseek.com",
		api: "openai-completions",
		models: [
			{
				id: "deepseek-flash",
				name: "DeepSeek Flash",
				// Pi needs reasoning=true to emit thinking:{type:"disabled"} for reasoning=off.
				reasoning: true,
				input: ["text"],
				contextWindow: 1_000_000,
				maxTokens: 2048, // Application output cap, not the provider's advertised maximum.
				// Peak USD/M tokens, 2026-09-20 official pricing; metadata, not billing telemetry.
				cost: { input: 0.3, output: 1.2, cacheRead: 0.006, cacheWrite: 0 },
				compat: {
					supportsStore: false,
					supportsDeveloperRole: false,
					maxTokensField: "max_tokens",
					requiresReasoningContentOnAssistantMessages: true,
					thinkingFormat: "deepseek",
				},
			},
		],
	});
}
