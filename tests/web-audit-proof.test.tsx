import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	AuditProofSurface,
	loadScopedAuditProof,
	AuditReadLifecycle,
	shouldLoadAuditProof,
} from "../web/src/audit.tsx";
import type { SessionApi } from "../web/src/session.ts";

const scope = { tenantId: "demo-tenant-a", storeId: "demo-store-a1" };

describe("bounded admin audit proof boundary", () => {
	it("requests the existing endpoint only for audit:read and accepts only current-scope safe DTOs", async () => {
		expect(shouldLoadAuditProof(["agent:invoke", "conversation:read"])).toBe(false);
		expect(shouldLoadAuditProof(["audit:read"])).toBe(true);
		const api = apiWith([
			response(200, [
				{
					id: "audit-1",
					tenantId: scope.tenantId,
					storeId: scope.storeId,
					conversationId: "conversation-a",
					eventType: "support-agent.audit",
					outcome: "answer",
					toolsCalled: ["search_faq"],
					createdAt: "2026-09-03T00:00:00.000Z",
				},
			]),
		]);

		expect(await loadScopedAuditProof(api, scope)).toMatchObject({ kind: "success", events: [{ id: "audit-1" }] });
		expect(api.paths).toEqual(["/api/v1/audit-events"]);
	});

	it("fails closed for malformed or cross-scope audit DTOs and keeps 401 distinct from 403", async () => {
		const crossScope = await loadScopedAuditProof(apiWith([response(200, [{
			id: "audit-1", tenantId: "demo-tenant-b", storeId: scope.storeId, conversationId: "conversation-a",
			eventType: "support-agent.audit", toolsCalled: [], createdAt: "2026-09-03T00:00:00.000Z",
		}])]), scope);
		expect(crossScope.kind).toBe("error");
		const payloadLeak = await loadScopedAuditProof(
			apiWith([
				response(200, [
					{
						id: "audit-1",
						tenantId: scope.tenantId,
						storeId: scope.storeId,
						conversationId: "conversation-a",
						eventType: "support-agent.audit",
						toolsCalled: [],
						createdAt: "2026-09-03T00:00:00.000Z",
						payload: { providerPayload: "must-not-be-consumed" },
					},
				]),
			]),
			scope,
		);
		expect(payloadLeak.kind).toBe("error");
		expect((await loadScopedAuditProof(apiWith([response(401, {})]), scope)).kind).toBe("session-invalidated");
		expect((await loadScopedAuditProof(apiWith([response(403, {})]), scope)).kind).toBe("forbidden");
	});

	it("never commits a stale Audit result and renders only safe public fields with the attribution limitation", () => {
		const lifecycle = new AuditReadLifecycle();
		const earlier = lifecycle.begin();
		lifecycle.invalidate();
		expect(lifecycle.complete(earlier)).toBe(false);

		const markup = renderToStaticMarkup(
			<AuditProofSurface
				state={{
					status: "verified",
					events: [{
						id: "audit-1", tenantId: scope.tenantId, storeId: scope.storeId, conversationId: "conversation-a",
						eventType: "support-agent.audit", outcome: "answer", toolsCalled: ["search_faq"],
						createdAt: "2026-09-03T00:00:00.000Z",
					}],
				}}
			/>,
		);
		expect(markup).toContain("Actor attribution is not recorded in the current audit schema.");
		expect(markup).toContain("audit-1");
		expect(markup).toContain("search_faq");
		expect(markup).not.toContain("payload");
		expect(markup).not.toContain("provider");
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
