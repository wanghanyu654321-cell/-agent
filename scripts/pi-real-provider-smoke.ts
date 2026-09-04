import { enterpriseRuntimeModeFromEnv } from "../src/enterprise/application.ts";
import { bootstrapPiEnterpriseRuntime, createPiEnterpriseRuntimeFactory } from "../src/enterprise/pi-runtime.ts";

async function main(): Promise<void> {
	const mode = enterpriseRuntimeModeFromEnv(process.env);
	if (mode.mode !== "pi-real") throw new Error("ENTERPRISE_RUNTIME_MODE=pi-real is required for this smoke.");

	const startedAt = Date.now();
	const resolved = await bootstrapPiEnterpriseRuntime({
		providerId: mode.providerId!,
		modelId: mode.modelId!,
	});
	const resource = createPiEnterpriseRuntimeFactory(resolved)(undefined as never);
	try {
		const result = await resource.runtime.run({
			conversationId: "pi-real-provider-smoke-faq",
			tenantId: "demo-tenant-a",
			storeId: "demo-store-a1",
			customerId: "pi-real-provider-smoke-customer",
			text: "请问门店营业时间？",
		});
		if (result.type !== "answer" || !result.toolsCalled.includes("search_faq")) {
			throw new Error("Pi real-provider smoke did not complete the governed FAQ.");
		}
		console.log(
			JSON.stringify({
				provider: mode.providerId,
				model: mode.modelId,
				resultType: result.type,
				toolsCalled: result.toolsCalled,
				authorizedEvidenceIds: result.evidence.map((evidence) => evidence.id),
				elapsedMs: Date.now() - startedAt,
			}),
		);
	} finally {
		await resource.close?.();
	}
}

void main().catch(() => {
	console.error("Pi real-provider smoke failed.");
	process.exitCode = 1;
});
