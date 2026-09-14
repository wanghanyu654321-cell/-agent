import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEnterpriseApplication, type EnterpriseApplication } from "../../src/enterprise/application.ts";

const url = process.env.POSTGRES_TEST_URL;
describe.skipIf(!url)("Job-Ready real application StoreOps and registry composition", () => {
	const schema = `integration_${randomUUID().replaceAll("-", "")}`;
	const owner = new Pool({ connectionString: url });
	let app: EnterpriseApplication;
	let origin: string;
	const cookies: Record<string, string> = {};
	beforeAll(async () => {
		await owner.query("CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public");
		await owner.query(`CREATE SCHEMA ${schema}`);
		const scopedUrl = new URL(url!);
		scopedUrl.searchParams.set("options", `-c search_path=${schema},public`);
		app = await createEnterpriseApplication({
			databaseUrl: scopedUrl.toString(),
			port: 0,
			storeTimeZone: () => "Asia/Shanghai",
			knowledgeEntries: [
				{
					id: "integration-fixture",
					kind: "reference",
					status: "approved",
					title: "Integration fixture only",
					content: "Test only canonical content",
					version: "1",
					sourceRef: "test://integration",
					updatedAt: "2026-09-06",
					tags: [],
					tenantScope: "demo-tenant-a",
					storeScope: "demo-store-a1",
				},
			],
		});
		await app.start();
		origin = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
		for (const key of ["alice", "susan", "bob"] as const) {
			const response = await fetch(`${origin}/api/v1/auth/login`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(app.demo.credentials[key]),
			});
			expect(response.status).toBe(200);
			cookies[key] = response.headers.get("set-cookie")!;
		}
	});
	afterAll(async () => {
		await app?.close();
		await owner.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
		await owner.end();
	});
	const request = (path: string, user = "alice", method = "GET", body?: unknown, headers = {}) =>
		fetch(`${origin}/api/v1${path}`, {
			method,
			headers: { cookie: cookies[user], "content-type": "application/json", ...headers },
			...(body ? { body: JSON.stringify(body) } : {}),
		});
	it("uses the ledger, keeps approved scoped registry metadata separate from private bodies", async () => {
		expect((await app.pool.query("SELECT id FROM enterprise_schema_migrations ORDER BY id")).rows).toEqual(
			[
				"001_enterprise_identity",
				"002_support_business_persistence",
				"003_job_ready_storeops",
				"004_job_ready_rag",
				"005_job_ready_rag_profiles",
			].map((id) => ({ id })),
		);
		const metadata = await (await request("/storeops/knowledge")).json();
		expect(metadata.items).toEqual([
			{
				id: "integration-fixture",
				kind: "reference",
				title: "Integration fixture only",
				version: "1",
				sourceRef: "test://integration",
				updatedAt: "2026-09-06T00:00:00.000Z",
				status: "approved",
			},
		]);
		expect(JSON.stringify(metadata)).not.toContain("canonical content");
		expect(await (await request("/storeops/knowledge", "bob")).json()).toEqual({ items: [] });
		await app.pool.query("UPDATE rag_documents SET status='retired',active=false");
		expect(await (await request("/storeops/knowledge")).json()).toEqual({ items: [] });
	});
	it("authenticates real StoreOps writes, scoped reads, idempotency and human confirmation without changing existing audit authority", async () => {
		const body = {
			conversationId: "integration-conversation",
			customerId: "fixture-customer",
			text: "fixture ordinary no-answer",
		};
		expect((await request("/support/respond", "alice", "POST", body)).status).toBe(200);
		const draft = { conversationId: body.conversationId, requestedService: "Fixture service" };
		const first = await request("/storeops/booking-intents", "alice", "POST", draft, {
			"idempotency-key": "fixture-create",
		});
		expect(first.status).toBe(201);
		const intent = await first.json();
		expect(intent.status).toBe("pending_confirmation");
		const duplicate = await request("/storeops/booking-intents", "alice", "POST", draft, {
			"idempotency-key": "fixture-create",
		});
		expect(duplicate.status).toBe(200);
		expect((await duplicate.json()).id).toBe(intent.id);
		const confirm = {
			expectedVersion: 1,
			action: "confirm",
			start: "2026-10-01T01:00:00Z",
			end: "2026-10-01T02:00:00Z",
		};
		expect(
			(await request(`/storeops/booking-intents/${intent.id}/transition`, "alice", "POST", confirm)).status,
		).toBe(403);
		const confirmed = await request(`/storeops/booking-intents/${intent.id}/transition`, "susan", "POST", confirm);
		expect(confirmed.status).toBe(200);
		expect((await confirmed.json()).status).toBe("confirmed");
		expect((await (await request("/storeops/booking-intents", "bob")).json()).items).toEqual([]);
		expect((await request("/audit-events", "susan")).status).toBe(403);
		expect((await request("/storeops/needs-attention", "alice")).status).toBe(403);
		expect((await (await request("/storeops/needs-attention", "susan")).json()).items).toEqual([
			expect.objectContaining({ conversationId: body.conversationId, basis: "fallback" }),
		]);
		const availability = { expectedVersion: 0, windows: [], status: "published" };
		expect(
			(await request("/storeops/availability/demo-membership-alice-a1/2026-10-01", "alice", "PUT", availability))
				.status,
		).toBe(403);
		expect(
			(await request("/storeops/availability/demo-membership-alice-a1/2026-10-01", "susan", "PUT", availability))
				.status,
		).toBe(200);
		expect((await (await request("/storeops/availability?date=2026-10-01", "bob")).json()).items).toEqual([]);
	});
});
