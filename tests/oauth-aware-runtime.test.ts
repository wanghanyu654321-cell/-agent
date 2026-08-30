import { describe, expect, it } from "vitest";
import { bootstrapOAuthAwareModelRuntime } from "../evals/selection/semantic/oauth-aware-runtime.ts";

describe("V2.3 OAuth-aware Pi completion bootstrap", () => {
	it("fails closed before model resolution or completion when provider auth is absent", async () => {
		let getModelCalls = 0;
		let completionCalls = 0;
		const bootstrap = await bootstrapOAuthAwareModelRuntime("openai-codex", "gpt-5.6-sol", async () => ({
			async checkAuth() {
				return undefined;
			},
			getModel() {
				getModelCalls += 1;
				return undefined;
			},
			async completeSimple() {
				completionCalls += 1;
				throw new Error("must not call completion");
			},
		}));

		expect(bootstrap).toEqual({ authConfigured: false });
		expect(getModelCalls).toBe(0);
		expect(completionCalls).toBe(0);
	});

	it("returns the same credential-aware runtime and resolved model after public auth succeeds", async () => {
		const model = { provider: "openai-codex", id: "gpt-5.6-sol" } as never;
		const runtime = {
			async checkAuth() {
				return { type: "oauth" };
			},
			getModel() {
				return model;
			},
			async completeSimple() {
				throw new Error("not called by bootstrap");
			},
		};
		const bootstrap = await bootstrapOAuthAwareModelRuntime("openai-codex", "gpt-5.6-sol", async () => runtime);

		expect(bootstrap).toEqual({ authConfigured: true, model, completionRuntime: runtime });
	});
});
