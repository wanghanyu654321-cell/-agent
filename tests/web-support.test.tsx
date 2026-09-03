import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SupportResultPanel } from "../web/src/App.tsx";
import { applyAuthenticatedApiStatus, type SessionApi } from "../web/src/session.ts";
import {
	parsePublicSupportResult,
	SupportRequestLifecycle,
	submitSupportRequest,
	type PublicSupportResult,
} from "../web/src/support.ts";

const alice = {
	actor: {
		userId: "demo-user-alice-agent",
		role: "agent",
		capabilities: ["agent:invoke", "conversation:read", "ticket:create"],
	},
	scope: { tenantId: "demo-tenant-a", storeId: "demo-store-a1" },
	request: { requestId: "request-1" },
};

const answer: PublicSupportResult = {
	type: "answer",
	text: "门店每天 09:00-21:00 营业。",
	piSessionId: "pi-session-1",
	toolsCalled: ["search_faq"],
	evidence: [
		{
			id: "faq-business-hours",
			kind: "faq",
			version: "faq-v1",
			sourceRef: "test://faq-business-hours",
		},
	],
};

describe("Support Proof Workspace public boundary", () => {
	it("submits only the three product request fields through the support endpoint", async () => {
		const api = apiWith([response(200, answer)]);
		const outcome = await submitSupportRequest(api, {
			conversationId: "conversation-a",
			customerId: "customer-a",
			text: "请问营业时间？",
		});

		expect(outcome).toEqual({ kind: "success", result: answer });
		expect(api.requests).toEqual([
			{
				path: "/api/v1/support/respond",
				method: "POST",
				body: { conversationId: "conversation-a", customerId: "customer-a", text: "请问营业时间？" },
			},
		]);
	});

	it("renders only public answer fields, authorized evidence references, and invoked tools", () => {
		const markup = renderToStaticMarkup(
			<SupportResultPanel
				submitted={{ conversationId: "conversation-a", customerId: "customer-a", text: "请问营业时间？" }}
				result={answer}
			/>,
		);

		expect(markup).toContain("Governed answer");
		expect(markup).toContain("门店每天 09:00-21:00 营业。");
		expect(markup).toContain("faq-business-hours");
		expect(markup).toContain("faq-v1");
		expect(markup).toContain("test://faq-business-hours");
		expect(markup).toContain("Tool invoked: search_faq");
		expect(markup).not.toContain("Ticket persisted");
		expect(markup).not.toContain("Handoff persisted");
	});

	it("renders an answer without authorized evidence as an answer, not an escalation", () => {
		const markup = renderToStaticMarkup(
			<SupportResultPanel
				submitted={submitted()}
				result={{
					type: "answer",
					text: "感谢您的咨询。",
					piSessionId: "pi-answer-without-evidence",
					toolsCalled: [],
					evidence: [],
				}}
			/>,
		);

		expect(markup).toContain("outcome-answer");
		expect(markup).toContain('<p class="explanation">Answer</p>');
		expect(markup).not.toContain("Escalation");
		expect(markup).toContain("No authorized evidence returned in the final result.");
	});

	it("renders fallback and escalation without inventing a hidden internal cause or exposing raw events", () => {
		const fallback = parsePublicSupportResult({
			type: "fallback",
			text: "请联系人工客服。",
			piSessionId: "pi-fallback",
			toolsCalled: [],
			evidence: [],
			sessionEvents: [{ type: "provider_payload", secret: "never render" }],
		});
		const escalation = parsePublicSupportResult({
			type: "escalation",
			text: "请由合格专业人员跟进。",
			piSessionId: "pi-escalation",
			toolsCalled: ["handoff_to_human"],
			evidence: [],
		});

		expect(fallback).toBeDefined();
		const fallbackMarkup = renderToStaticMarkup(
			<SupportResultPanel submitted={submitted()} result={fallback!} />,
		);
		const escalationMarkup = renderToStaticMarkup(
			<SupportResultPanel submitted={submitted()} result={escalation!} />,
		);
		expect(fallbackMarkup).toContain("Controlled fallback");
		expect(fallbackMarkup).toContain("No authorized evidence returned in the final result.");
		expect(fallbackMarkup).not.toContain("ambiguous");
		expect(fallbackMarkup).not.toContain("timeout");
		expect(fallbackMarkup).not.toContain("sessionEvents");
		expect(escalationMarkup).toContain("Escalation");
		expect(escalationMarkup).toContain("Tool invoked: handoff_to_human");
		expect(escalationMarkup).not.toContain("Handoff persisted");
	});

	it("fails safely on a malformed public SupportResult", () => {
		expect(
			parsePublicSupportResult({
				type: "answer",
				text: "safe",
				piSessionId: "pi-1",
				toolsCalled: ["search_faq"],
				evidence: [{ id: "missing-version", kind: "faq", sourceRef: "test://missing" }],
			}),
		).toBeUndefined();
	});

	it("turns authenticated support 401 into session invalidation and preserves identity for 403", async () => {
		const unauthorized = await submitSupportRequest(apiWith([response(401)]), submitted());
		const forbidden = await submitSupportRequest(apiWith([response(403)]), submitted());

		expect(unauthorized).toEqual({ kind: "session-invalidated" });
		expect(forbidden).toEqual({ kind: "forbidden" });
		expect(applyAuthenticatedApiStatus({ phase: "authenticated", context: alice }, 401)).toEqual({
			phase: "session-invalidated",
		});
		expect(applyAuthenticatedApiStatus({ phase: "authenticated", context: alice }, 403)).toEqual({
			phase: "authorization-error",
			context: alice,
		});
	});

	it("guards duplicate submissions and discards a late response after logout or identity replacement", () => {
		const lifecycle = new SupportRequestLifecycle();
		const first = lifecycle.begin();
		expect(first).toBeTypeOf("number");
		expect(lifecycle.begin()).toBeUndefined();
		lifecycle.invalidate();
		expect(lifecycle.complete(first!)).toBe(false);

		const replacement = lifecycle.begin();
		expect(replacement).toBeTypeOf("number");
		expect(lifecycle.complete(replacement!)).toBe(true);
	});
});

function submitted() {
	return { conversationId: "conversation-a", customerId: "customer-a", text: "请问营业时间？" };
}

function apiWith(responses: Response[]): SessionApi & {
	requests: Array<{ path: string; method: string; body: Record<string, unknown> | undefined }>;
} {
	const requests: Array<{ path: string; method: string; body: Record<string, unknown> | undefined }> = [];
	return {
		requests,
		async request(path, init = {}) {
			requests.push({
				path,
				method: init.method ?? "GET",
				body: typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined,
			});
			const next = responses.shift();
			if (!next) throw new Error("Unexpected request.");
			return next;
		},
	};
}

function response(status: number, body?: unknown): Response {
	return new Response(body === undefined ? undefined : JSON.stringify(body), {
		status,
		headers: body === undefined ? undefined : { "content-type": "application/json" },
	});
}
