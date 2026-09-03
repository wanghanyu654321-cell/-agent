import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthenticatedShell } from "../web/src/App.tsx";
import {
	applyAuthenticatedApiStatus,
	bootstrapSession,
	loginAndReloadSession,
	logoutAndClearSession,
	type SessionApi,
} from "../web/src/session.ts";

const alice = {
	actor: {
		userId: "demo-user-alice-agent",
		role: "agent" as const,
		capabilities: ["agent:invoke", "conversation:read", "ticket:create"],
	},
	scope: { tenantId: "demo-tenant-a", storeId: "demo-store-a1" },
	request: { requestId: "request-1" },
};

describe("React same-origin session model", () => {
	it("returns Login state when bootstrap /auth/me is unauthenticated", async () => {
		const state = await bootstrapSession(apiWith([response(401, { error: "unauthenticated" })]));
		expect(state).toEqual({ phase: "unauthenticated" });
	});

	it("reloads server-derived identity from /auth/me after a successful login", async () => {
		const api = apiWith([
			response(200, { actor: { role: "admin" } }),
			response(200, alice),
		]);

		const state = await loginAndReloadSession(api, { email: "alice.agent@demo.example", password: "demo" });

		expect(api.requests).toEqual([
			{ path: "/api/v1/auth/login", method: "POST" },
			{ path: "/api/v1/auth/me", method: "GET" },
		]);
		expect(state).toEqual({ phase: "authenticated", context: alice });
	});

	it("invalidates frontend authority on authenticated 401 but preserves it for a bounded 403 state", () => {
		const authenticated = { phase: "authenticated" as const, context: alice };
		expect(applyAuthenticatedApiStatus(authenticated, 401)).toEqual({ phase: "session-invalidated" });
		expect(applyAuthenticatedApiStatus(authenticated, 403)).toEqual({
			phase: "authorization-error",
			context: alice,
		});
	});

	it("clears old actor and scope before logout returns", async () => {
		const api = apiWith([response(204)]);
		const state = await logoutAndClearSession(api, { phase: "authenticated", context: alice });
		expect(api.requests).toEqual([{ path: "/api/v1/auth/logout", method: "POST" }]);
		expect(state).toEqual({ phase: "unauthenticated" });
	});

	it("renders only server-derived identity context without editable authority controls", () => {
		const markup = renderToStaticMarkup(<AuthenticatedShell context={alice} onLogout={() => undefined} />);
		expect(markup).toContain("demo-user-alice-agent");
		expect(markup).toContain("demo-tenant-a");
		expect(markup).toContain("demo-store-a1");
		expect(markup).toContain("agent:invoke");
		expect(markup).not.toContain("<select");
		expect(markup).not.toContain('name="tenantId"');
		expect(markup).not.toContain('name="storeId"');
		expect(markup).not.toContain('name="role"');
	});
});

function apiWith(responses: Response[]): SessionApi & { requests: Array<{ path: string; method: string }> } {
	const requests: Array<{ path: string; method: string }> = [];
	return {
		requests,
		async request(path, init = {}) {
			requests.push({ path, method: init.method ?? "GET" });
			const response = responses.shift();
			if (!response) throw new Error("Unexpected request.");
			return response;
		},
	};
}

function response(status: number, body?: unknown): Response {
	return new Response(body === undefined ? undefined : JSON.stringify(body), {
		status,
		headers: body === undefined ? undefined : { "content-type": "application/json" },
	});
}
