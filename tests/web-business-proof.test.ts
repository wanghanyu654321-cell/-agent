import { describe, expect, it } from "vitest";
import { loadScopedBusinessProof } from "../web/src/business.ts";
import type { SessionApi } from "../web/src/session.ts";

const scope = { tenantId: "demo-tenant-a", storeId: "demo-store-a1" };

describe("durable business proof boundary", () => {
	it("reads the two scoped endpoints without browser-owned scope and accepts only current-scope records", async () => {
		const api = apiWith([
			response(200, [
				{
					id: "ticket-1",
					tenantId: scope.tenantId,
					storeId: scope.storeId,
					conversationId: "conversation-a",
					summary: "Refund",
					idempotencyKey: "key-a",
					createdAt: "2026-09-03T00:00:00.000Z",
				},
			]),
			response(200, [
				{
					id: "handoff-1",
					tenantId: scope.tenantId,
					storeId: scope.storeId,
					conversationId: "conversation-a",
					reason: "qualified_professional_required: safety",
					createdAt: "2026-09-03T00:00:00.000Z",
				},
			]),
		]);

		expect(await loadScopedBusinessProof(api, scope)).toMatchObject({
			kind: "success",
			tickets: [expect.objectContaining({ id: "ticket-1" })],
			handoffs: [expect.objectContaining({ id: "handoff-1" })],
		});
		expect(api.paths).toEqual(["/api/v1/tickets", "/api/v1/handoffs"]);
	});

	it("fails closed on cross-scope or malformed business records", async () => {
		const crossScope = apiWith([
			response(200, [
				{
					id: "ticket-1",
					tenantId: "demo-tenant-b",
					storeId: scope.storeId,
					conversationId: "conversation-a",
					summary: "Refund",
					idempotencyKey: "key-a",
					createdAt: "2026-09-03T00:00:00.000Z",
				},
			]),
			response(200, []),
		]);
		expect(await loadScopedBusinessProof(crossScope, scope)).toEqual({
			kind: "error",
			message: "Durable business state could not be verified.",
		});

		const malformed = apiWith([response(200, {}), response(200, [])]);
		expect(await loadScopedBusinessProof(malformed, scope)).toEqual({
			kind: "error",
			message: "Durable business state could not be verified.",
		});
	});

	it("keeps 401 and 403 distinct", async () => {
		expect(await loadScopedBusinessProof(apiWith([response(401, {}), response(200, [])]), scope)).toEqual({
			kind: "session-invalidated",
		});
		expect(await loadScopedBusinessProof(apiWith([response(403, {}), response(200, [])]), scope)).toEqual({
			kind: "forbidden",
		});
	});
});

function apiWith(responses: Response[]): SessionApi & { paths: string[] } {
	const paths: string[] = [];
	return {
		paths,
		async request(path) {
			paths.push(path);
			const next = responses.shift();
			if (!next) throw new Error("Unexpected request.");
			return next;
		},
	};
}

function response(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
