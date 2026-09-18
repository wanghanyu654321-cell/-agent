import { fauxAssistantMessage, registerFauxProvider, streamSimple } from "@earendil-works/pi-ai/compat";
import { afterEach, describe, expect, it, vi } from "vitest";
import { enterpriseRuntimeFactoryFromEnv, enterpriseRuntimeModeFromEnv } from "../src/enterprise/application.ts";
import { bootstrapPiEnterpriseRuntime, createPiEnterpriseRuntimeFactory } from "../src/enterprise/pi-runtime.ts";

const unregisterProviders: Array<() => void> = [];

afterEach(() => {
	while (unregisterProviders.length > 0) unregisterProviders.pop()?.();
});

describe("Enterprise Pi real-provider runtime mode", () => {
	it("defaults to deterministic and fails closed for unsupported or incomplete pi-real configuration", async () => {
		expect(enterpriseRuntimeModeFromEnv({ DATABASE_URL: "postgres://demo" })).toEqual({ mode: "deterministic" });
		expect(() => enterpriseRuntimeModeFromEnv({ ENTERPRISE_RUNTIME_MODE: "other" })).toThrow(
			"ENTERPRISE_RUNTIME_MODE must be deterministic or pi-real.",
		);
		expect(() => enterpriseRuntimeModeFromEnv({ ENTERPRISE_RUNTIME_MODE: "pi-real" })).toThrow(
			"PI_PROVIDER and PI_MODEL are required for pi-real runtime mode.",
		);

		const createRuntime = vi.fn();
		await expect(
			enterpriseRuntimeFactoryFromEnv({ DATABASE_URL: "postgres://demo" }, createRuntime),
		).resolves.toBeUndefined();
		expect(createRuntime).not.toHaveBeenCalled();

		const factory = vi.fn().mockResolvedValue(() => ({ runtime: { run: vi.fn() } }));
		await enterpriseRuntimeFactoryFromEnv(
			{
				DATABASE_URL: "postgres://demo",
				ENTERPRISE_RUNTIME_MODE: "pi-real",
				PI_PROVIDER: "openai-codex",
				PI_MODEL: "gpt-5.6-sol",
			},
			factory,
		);
		expect(factory).toHaveBeenCalledExactlyOnceWith("openai-codex", "gpt-5.6-sol");
	});

	it("rejects missing Pi auth before model resolution and never exposes a credential-like cause", async () => {
		const getModel = vi.fn();
		await expect(
			bootstrapPiEnterpriseRuntime({
				providerId: "openai-codex",
				modelId: "gpt-5.6-sol",
				createRuntime: async () => ({
					async checkAuth() {
						return undefined;
					},
					getModel,
					streamSimple: vi.fn(),
				}),
			}),
		).rejects.toThrow("Pi provider authentication is not configured.");
		expect(getModel).not.toHaveBeenCalled();

		await expect(
			bootstrapPiEnterpriseRuntime({
				providerId: "openai-codex",
				modelId: "gpt-5.6-sol",
				createRuntime: async () => {
					throw new Error("token=not-for-public-output");
				},
			}),
		).rejects.not.toThrow("token=not-for-public-output");
	});

	it("resolves the exact Pi model and stream function, rejects an unknown model, and preserves governed tool composition", async () => {
		const faux = registerFauxProvider();
		unregisterProviders.push(faux.unregister);
		const model = faux.getModel();
		const streamFn = vi.fn(streamSimple);
		const resolved = await bootstrapPiEnterpriseRuntime({
			providerId: "openai-codex",
			modelId: "gpt-5.6-sol",
			createRuntime: async () => ({
				async checkAuth(providerId) {
					return providerId === "openai-codex" ? { type: "oauth" } : undefined;
				},
				getModel(providerId, modelId) {
					return providerId === "openai-codex" && modelId === "gpt-5.6-sol" ? model : undefined;
				},
				streamSimple: streamFn,
			}),
		});
		expect(resolved.model).toBe(model);
		expect(resolved.streamFn).not.toBe(streamFn);

		await expect(
			bootstrapPiEnterpriseRuntime({
				providerId: "openai-codex",
				modelId: "missing-model",
				createRuntime: async () => ({
					async checkAuth() {
						return { type: "oauth" };
					},
					getModel() {
						return undefined;
					},
					streamSimple: streamFn,
				}),
			}),
		).rejects.toThrow("Pi provider/model is unavailable.");

		faux.setResponses([
			fauxAssistantMessage(
				[
					{
						type: "toolCall",
						id: "pi-real-faq",
						name: "search_faq",
						arguments: { query: "营业时间" },
					},
				],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("Pi adapter fixture completion."),
		]);
		const resource = createPiEnterpriseRuntimeFactory(resolved)(undefined as never);
		const result = await resource.runtime.run({
			conversationId: "pi-real-factory-faq",
			tenantId: "demo-tenant-a",
			storeId: "demo-store-a1",
			customerId: "demo-customer",
			text: "请问门店营业时间？",
		});
		expect(streamFn).toHaveBeenCalled();
		expect(streamFn.mock.calls[0]?.[0]).toBe(model);
		expect(result).toMatchObject({
			type: "answer",
			toolsCalled: ["search_faq"],
			evidence: [expect.objectContaining({ id: "demo-faq-business-hours" })],
		});
	});
});
