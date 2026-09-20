import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { EnterpriseSupportService } from "../../src/enterprise/business.ts";
import { createSupportExecutionContext } from "../../src/enterprise/identity.ts";
import { bootstrapPiEnterpriseRuntime, createPiEnterpriseRuntimeFactory } from "../../src/enterprise/pi-runtime.ts";
import {
	applyEnterpriseBusinessMigrations,
	PostgresEnterpriseBusinessRepository,
	PostgresIdentityRepository,
} from "../../src/enterprise/postgres.ts";
import { portfolioDemoFaq, portfolioDemoKnowledge } from "../../src/portfolio-demo-data.ts";
import { cases, fixtureVersion } from "./cases.ts";
import { evaluateCase, evaluationStatus } from "./evaluate.ts";

const identity = {
	provider: "deepseek",
	requestedModel: "deepseek-flash",
	// Pinned Pi normalizes AssistantMessage.model to the requested ID. It is not API-returned evidence.
	returnedModel: null,
	returnedModelStatus: "NOT_EXPOSED_BY_PINNED_PI",
	timestamp: new Date().toISOString(),
	fixtureVersion,
};

async function main(): Promise<void> {
	const missing = [
		...(!process.argv.includes("--test-database") ? ["--test-database acknowledgement"] : []),
		...(!process.env.DEEPSEEK_API_KEY ? ["DEEPSEEK_API_KEY"] : []),
		...(!process.env.POSTGRES_TEST_URL ? ["POSTGRES_TEST_URL"] : []),
	];
	if (missing.length) {
		console.log(JSON.stringify({ ...identity, status: "BLOCKED", missing, measurements: null }));
		process.exitCode = 2;
		return;
	}
	const pool = new Pool({
		connectionString: process.env.POSTGRES_TEST_URL,
		connectionTimeoutMillis: 5000,
		statement_timeout: 10000,
	});
	const measurements: ReturnType<typeof evaluateCase>[] = [];
	try {
		// Test database only; existing migrations, unique synthetic tenant, no production URL fallback.
		await applyEnterpriseBusinessMigrations(pool);
		const suffix = randomUUID();
		const scope = { tenantId: `deepseek-eval-${suffix}`, storeId: `deepseek-eval-store-${suffix}` };
		const repository = new PostgresEnterpriseBusinessRepository(pool);
		const identities = new PostgresIdentityRepository(pool);
		await identities.createTenant({ id: scope.tenantId, name: "Synthetic DeepSeek eval", createdAt: new Date() });
		await identities.createStore({
			id: scope.storeId,
			tenantId: scope.tenantId,
			name: "Synthetic store",
			createdAt: new Date(),
		});
		const resolved = await bootstrapPiEnterpriseRuntime({ providerId: "deepseek", modelId: "deepseek-flash" });
		const resource = createPiEnterpriseRuntimeFactory(resolved, {
			faq: portfolioDemoFaq,
			knowledge: portfolioDemoKnowledge.slice(0, 1), // One admitted synthetic policy, no ambiguous demo candidates.
			allowSyntheticTestFixtures: true,
			allowSyntheticTestKnowledge: true,
		})(repository);
		const service = new EnterpriseSupportService({ repository, runtime: resource.runtime });
		// Single bounded pass. No retry/rerun of cases and no ordinary CI dependency.
		for (const fixture of cases) {
			const conversationId = `deepseek-eval-${suffix}-${fixture.id}`;
			const context = createSupportExecutionContext(
				{
					id: "synthetic-membership",
					userId: "synthetic-user",
					...scope,
					role: "supervisor",
					createdAt: new Date(),
				},
				randomUUID(),
			);
			if (fixture.noWrite) context.actor.capabilities = ["agent:invoke", "conversation:read"];
			const result = await service.respond(context, {
				conversationId,
				customerId: "synthetic-customer",
				text: fixture.text,
			});
			const writes = await pool.query<{ tenant_id: string; store_id: string }>(
				"SELECT tenant_id, store_id FROM tickets WHERE conversation_id = $1 UNION ALL SELECT tenant_id, store_id FROM handoffs WHERE conversation_id = $1",
				[conversationId],
			);
			measurements.push(evaluateCase(fixture, result, writes.rows, scope));
		}
		const status = evaluationStatus(measurements);
		console.log(
			JSON.stringify(
				{
					...identity,
					status,
					persistence: "REAL_POSTGRESQL",
					measurements,
				},
				null,
				2,
			),
		);
		process.exitCode = status === "FAIL" ? 1 : status === "PARTIAL" ? 2 : 0;
	} catch {
		// Neither provider error bodies nor database URLs are safe operational output.
		console.log(
			JSON.stringify({ ...identity, status: "ERROR", errorClass: "eval_execution_failed", measurements }, null, 2),
		);
		process.exitCode = 1;
	} finally {
		await pool.end();
	}
}

await main();
