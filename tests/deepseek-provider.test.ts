import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";
import { configureDeepSeek } from "../src/enterprise/deepseek-provider.ts";
import { InMemoryRetrievalService, InMemorySupportStore, SupportAgentRuntime } from "../src/index.ts";

it("uses pinned Pi native auth and sends the official model with thinking explicitly disabled", async () => {
	const credentials = new InMemoryCredentialStore();
	await credentials.modify("deepseek", async () => ({ type: "api_key", key: "synthetic-test-only" }));
	const runtime = await ModelRuntime.create({ credentials, modelsPath: null, refreshOnCreate: false });
	configureDeepSeek(runtime);
	expect(await runtime.checkAuth("deepseek")).toMatchObject({ type: "api_key" });
	const model = runtime.getModel("deepseek", "deepseek-flash");
	expect(model?.baseUrl).toBe("https://api.deepseek.com");
	if (!model) throw new Error("model missing");
	let payload: Record<string, unknown> | undefined;
	const result = await runtime
		.streamSimple(
			model,
			{
				messages: [{ role: "user", content: "hello", timestamp: 0 }],
			},
			{
				fetch: async (input, init) => {
					expect(String(input)).toBe("https://api.deepseek.com/chat/completions");
					payload = JSON.parse(String(init?.body));
					return new Response(
						'data: {"id":"test","choices":[{"index":0,"delta":{"content":"hello"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
						{
							headers: { "content-type": "text/event-stream" },
						},
					);
				},
			},
		)
		.result();
	expect(result.stopReason).toBe("stop");
	expect(payload).toMatchObject({ model: "deepseek-flash", thinking: { type: "disabled" } });
	expect(Number(payload?.max_tokens)).toBeLessThanOrEqual(2048);
});

it.each([401, 429, 503, 200])(
	"fails closed through the actual Pi adapter for HTTP %s or invalid SSE",
	async (status) => {
		const credentials = new InMemoryCredentialStore();
		await credentials.modify("deepseek", async () => ({ type: "api_key", key: "synthetic-test-only" }));
		const modelRuntime = await ModelRuntime.create({ credentials, modelsPath: null, refreshOnCreate: false });
		configureDeepSeek(modelRuntime);
		const model = modelRuntime.getModel("deepseek", "deepseek-flash");
		if (!model) throw new Error("model missing");
		const runtime = new SupportAgentRuntime({
			model,
			streamFn: (selected, context, options) =>
				modelRuntime.streamSimple(selected, context, {
					...options,
					maxRetries: 0,
					fetch: async () =>
						new Response(status === 200 ? "data: {broken-json}\n\n" : '{"error":{"message":"synthetic error"}}', {
							status,
							headers: { "content-type": status === 200 ? "text/event-stream" : "application/json" },
						}),
				}),
			store: new InMemorySupportStore(),
			retrieval: new InMemoryRetrievalService(),
			faq: [],
			realPolicy: true,
		});
		const result = await runtime.run({
			conversationId: "synthetic",
			tenantId: "synthetic",
			storeId: "synthetic",
			customerId: "synthetic",
			text: "你好",
		});
		expect(result).toMatchObject({ type: "fallback", policyDecision: "SAFE_FALLBACK" });
		expect(result.text).not.toContain("synthetic error");
	},
);
