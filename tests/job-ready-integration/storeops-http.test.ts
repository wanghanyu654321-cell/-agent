import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnterpriseAuthService } from "../../src/enterprise/auth.ts";
import { seedPortfolioEnterpriseDemoData } from "../../src/enterprise/demo-data.ts";
import { createEnterpriseHttpServer, type EnterpriseHttpServerOptions } from "../../src/enterprise/http-api.ts";
import { InMemoryIdentityRepository } from "../../src/enterprise/identity.ts";
import { StoreOpsError } from "../../src/storeops/contracts.ts";

const servers: ReturnType<typeof createEnterpriseHttpServer>[] = [];
afterEach(async () => {
	for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve()));
});
async function setup() {
	const repository = new InMemoryIdentityRepository();
	const demo = await seedPortfolioEnterpriseDemoData(repository);
	const auth = new EnterpriseAuthService(repository);
	const listBookingIntents = vi.fn(async () => ({ items: [], truncated: false }));
	const service: EnterpriseHttpServerOptions["storeOpsService"] = {
		listBookingIntents,
		listAvailability: vi.fn(async () => ({ items: [], staff: [], timeZone: "Asia/Shanghai" })),
		putAvailability: vi.fn(async () => {
			throw new StoreOpsError("availability_conflict");
		}),
		createBookingIntent: vi.fn(async () => {
			throw new StoreOpsError("not_found");
		}),
		transitionBookingIntent: vi.fn(async () => {
			throw new StoreOpsError("booking_intent_conflict");
		}),
		listNeedsAttention: vi.fn(async () => ({ items: [], truncated: false })),
	};
	const server = createEnterpriseHttpServer({ auth, storeOpsService: service });
	servers.push(server);
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const cookies: Record<string, string> = {};
	for (const key of ["alice", "susan", "bob"] as const)
		cookies[key] =
			`support_session=${(await auth.login(demo.credentials[key].email, demo.credentials[key].password))!.token}`;
	const request = (path: string, user?: string, method = "GET", body?: unknown, extra = {}) =>
		fetch(`${origin}/api/v1/storeops${path}`, {
			method,
			headers: { ...(user ? { cookie: cookies[user] } : {}), "content-type": "application/json", ...extra },
			...(body ? { body: JSON.stringify(body) } : {}),
		});
	return { request, service, origin };
}
describe("StoreOps same-origin HTTP composition", () => {
	it("requires auth, derives scope, rejects scope parameters and keeps unknown API routes out of static delivery", async () => {
		const { request, service } = await setup();
		expect((await request("/booking-intents")).status).toBe(401);
		expect((await request("/booking-intents", "alice")).status).toBe(200);
		expect((await request("/booking-intents", "bob")).status).toBe(200);
		expect(service!.listBookingIntents).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ scope: { tenantId: "demo-tenant-a", storeId: "demo-store-a1" } }),
		);
		expect(service!.listBookingIntents).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ scope: { tenantId: "demo-tenant-b", storeId: "demo-store-b1" } }),
		);
		expect((await request("/booking-intents?tenantId=forged", "alice")).status).toBe(400);
		expect((await request("/unknown", "alice")).status).toBe(404);
		expect(service!.listBookingIntents).toHaveBeenCalledTimes(2);
	});
	it("preserves manager authority, Origin checks, strict bodies and bounded conflict codes", async () => {
		const { request, service } = await setup();
		const write = { expectedVersion: 0, windows: [], status: "published" };
		expect((await request("/availability/staff/2026-10-01", "alice", "PUT", write)).status).toBe(403);
		expect(
			(await request("/availability/staff/2026-10-01", "susan", "PUT", write, { origin: "https://foreign.example" }))
				.status,
		).toBe(403);
		expect(
			(await request("/availability/staff/2026-10-01", "susan", "PUT", { ...write, tenantId: "forged" })).status,
		).toBe(400);
		const conflict = await request("/availability/staff/2026-10-01", "susan", "PUT", write);
		expect(conflict.status).toBe(409);
		expect(await conflict.json()).toEqual({ error: "availability_conflict" });
		expect(service!.putAvailability).toHaveBeenCalledTimes(1);
		expect((await request("/needs-attention", "alice")).status).toBe(403);
		expect((await request("/needs-attention", "susan")).status).toBe(200);
		expect(
			(
				await request("/booking-intents/id/transition", "alice", "POST", {
					expectedVersion: 1,
					action: "confirm",
					start: "2026-10-01T01:00:00Z",
					end: "2026-10-01T02:00:00Z",
				})
			).status,
		).toBe(403);
		expect(service!.transitionBookingIntent).not.toHaveBeenCalled();
	});
});
