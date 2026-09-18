import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { enterpriseRuntimeModeFromEnv } from "../src/enterprise/application.ts";
import { bootstrapPiEnterpriseRuntime, createPiEnterpriseRuntimeFactory } from "../src/enterprise/pi-runtime.ts";

type PiRealProviderSmokeBlockedCategory =
	| "CONFIGURATION_INVALID"
	| "AUTH_UNAVAILABLE"
	| "MODEL_UNAVAILABLE"
	| "INITIALIZATION_UNAVAILABLE"
	| "EXECUTION_UNAVAILABLE";

export function formatPiRealProviderSmokeBlockedOutput(error: unknown): string {
	const category = piRealProviderSmokeBlockedCategory(error);
	return `REAL_PROVIDER_SMOKE_BLOCKED ${category}`;
}

function piRealProviderSmokeBlockedCategory(error: unknown): PiRealProviderSmokeBlockedCategory {
	if (!(error instanceof Error)) return "EXECUTION_UNAVAILABLE";
	if (
		error.message === "ENTERPRISE_RUNTIME_MODE=pi-real is required for this smoke." ||
		error.message === "ENTERPRISE_RUNTIME_MODE must be deterministic or pi-real." ||
		error.message === "PI_PROVIDER and PI_MODEL are required for pi-real runtime mode."
	) {
		return "CONFIGURATION_INVALID";
	}
	if (
		error.message === "Pi provider authentication is not configured." ||
		error.message === "Pi provider authentication could not be verified."
	) {
		return "AUTH_UNAVAILABLE";
	}
	if (error.message === "Pi provider/model is unavailable.") return "MODEL_UNAVAILABLE";
	if (error.message === "Pi provider initialization failed.") return "INITIALIZATION_UNAVAILABLE";
	return "EXECUTION_UNAVAILABLE";
}

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

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
	void main().catch((error: unknown) => {
		console.error(formatPiRealProviderSmokeBlockedOutput(error));
		process.exitCode = 1;
	});
}
