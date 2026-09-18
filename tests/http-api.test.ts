import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fauxAssistantMessage, registerFauxProvider, streamSimple } from "@earendil-works/pi-ai/compat";
import { afterEach, describe, expect, it } from "vitest";
import { createPortfolioHttpServer, type SupportRuntimePort } from "../src/http-api.ts";
import {
	InMemoryRetrievalService,
	InMemorySupportStore,
	SupportAgentRuntime,
	type SupportRequest,
	type SupportResult,
} from "../src/index.ts";

const registrations: Array<{ unregister(): void }> = [];

afterEach(() => {
	while (registrations.length > 0) registrations.pop()?.unregister();
});

const requiredRequest: SupportRequest = {
	conversationId: "portfolio-conversation",
	tenantId: "tenant-a",
	storeId: "store-a",
	customerId: "customer-a",
	text: "请问营业时间？",
};

function supportResult(overrides: Partial<SupportResult> = {}): SupportResult {
	return {
		type: "answer",
		text: "门店每天 09:00-21:00 营业。",
		piSessionId: "pi-session-1",
		toolsCalled: ["search_faq"],
		sessionEvents: [{ type: "internal_event" } as never],
		evidence: [
			{
				id: "faq-business-hours",
				kind: "faq",
				version: "faq-v1",
				sourceRef: "test://faq-business-hours",
			},
		],
		...overrides,
	};
}

function stubRuntime(result: SupportResult | Error): { runtime: SupportRuntimePort; requests: SupportRequest[] } {
	const requests: SupportRequest[] = [];
	return {
		requests,
		runtime: {
			async run(request) {
				requests.push(structuredClone(request));
				if (result instanceof Error) throw result;
				return result;
			},
		},
	};
}

async function withServer<T>(runtime: SupportRuntimePort, run: (origin: string) => Promise<T>): Promise<T> {
	const server = createPortfolioHttpServer(runtime);
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address() as AddressInfo;
	try {
		return await run(`http://127.0.0.1:${address.port}`);
	} finally {
		await closeServer(server);
	}
}

async function closeServer(server: Server): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});
}

async function jsonResponse(response: Response): Promise<Record<string, unknown>> {
	return (await response.json()) as Record<string, unknown>;
}

describe("Portfolio V1 thin HTTP API", () => {
	it("returns health without invoking the runtime", async () => {
		const { runtime, requests } = stubRuntime(supportResult());
		await withServer(runtime, async (origin) => {
			const response = await fetch(`${origin}/healthz`);
			expect(response.status).toBe(200);
			expect(await jsonResponse(response)).toEqual({ status: "ok" });
		});
		expect(requests).toEqual([]);
	});

	it("forwards the required request fields unchanged and maps a safe answer response", async () => {
		const { runtime, requests } = stubRuntime(supportResult());
		await withServer(runtime, async (origin) => {
			const response = await fetch(`${origin}/api/v1/support/respond`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(requiredRequest),
			});
			expect(response.status).toBe(200);
			expect(await jsonResponse(response)).toEqual({
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
			});
		});
		expect(requests).toEqual([requiredRequest]);
	});

	it("forwards optional permissions and escalation fields unchanged", async () => {
		const { runtime, requests } = stubRuntime(supportResult());
		const request = {
			...requiredRequest,
			permissions: ["tickets:write", "handoff:write"],
			mayEscalate: true,
			requiresEscalation: false,
		};
		await withServer(runtime, async (origin) => {
			const response = await fetch(`${origin}/api/v1/support/respond`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(request),
			});
			expect(response.status).toBe(200);
		});
		expect(requests).toEqual([request]);
	});

	it.each([
		["fallback", supportResult({ type: "fallback", text: "请联系人工客服。", evidence: [], toolsCalled: [] })],
		[
			"escalation",
			supportResult({
				type: "escalation",
				text: "已转交人工客服。",
				evidence: [],
				toolsCalled: ["handoff_to_human"],
			}),
		],
	])("maps a %s response without internal session events", async (_type, result) => {
		const { runtime } = stubRuntime(result);
		await withServer(runtime, async (origin) => {
			const response = await fetch(`${origin}/api/v1/support/respond`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(requiredRequest),
			});
			const body = await jsonResponse(response);
			expect(response.status).toBe(200);
			expect(body.type).toBe(result.type);
			expect(body.text).toBe(result.text);
			expect(body).not.toHaveProperty("sessionEvents");
		});
	});

	it("rejects invalid JSON before runtime invocation", async () => {
		const { runtime, requests } = stubRuntime(supportResult());
		await withServer(runtime, async (origin) => {
			const response = await fetch(`${origin}/api/v1/support/respond`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{not valid JSON",
			});
			expect(response.status).toBe(400);
			expect(await jsonResponse(response)).toEqual({ error: "invalid_request" });
		});
		expect(requests).toEqual([]);
	});

	it("rejects missing required fields before runtime invocation", async () => {
		const { runtime, requests } = stubRuntime(supportResult());
		const { customerId: _customerId, ...missingCustomer } = requiredRequest;
		await withServer(runtime, async (origin) => {
			const response = await fetch(`${origin}/api/v1/support/respond`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(missingCustomer),
			});
			expect(response.status).toBe(400);
		});
		expect(requests).toEqual([]);
	});

	it.each([
		["tenantId", 42],
		["permissions", "tickets:write"],
		["mayEscalate", "true"],
		["requiresEscalation", "false"],
	])("rejects an invalid %s primitive before runtime invocation", async (field, value) => {
		const { runtime, requests } = stubRuntime(supportResult());
		await withServer(runtime, async (origin) => {
			const response = await fetch(`${origin}/api/v1/support/respond`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ ...requiredRequest, [field]: value }),
			});
			expect(response.status).toBe(400);
			expect(await jsonResponse(response)).toEqual({ error: "invalid_request" });
		});
		expect(requests).toEqual([]);
	});

	it("rejects a JSON body larger than 64 KiB without invoking the runtime", async () => {
		const { runtime, requests } = stubRuntime(supportResult());
		await withServer(runtime, async (origin) => {
			const response = await fetch(`${origin}/api/v1/support/respond`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ ...requiredRequest, text: "x".repeat(64 * 1024) }),
			});
			expect(response.status).toBe(413);
			expect(await jsonResponse(response)).toEqual({ error: "request_body_too_large" });
		});
		expect(requests).toEqual([]);
	});

	it("returns 404 for an unknown route and 405 with Allow for known routes using the wrong method", async () => {
		const { runtime } = stubRuntime(supportResult());
		await withServer(runtime, async (origin) => {
			const unknown = await fetch(`${origin}/not-found`);
			expect(unknown.status).toBe(404);
			expect(await jsonResponse(unknown)).toEqual({ error: "not_found" });

			const wrongMethod = await fetch(`${origin}/api/v1/support/respond`);
			expect(wrongMethod.status).toBe(405);
			expect(wrongMethod.headers.get("allow")).toBe("POST");
			expect(await jsonResponse(wrongMethod)).toEqual({ error: "method_not_allowed" });
		});
	});

	it("maps runtime failures to a generic 500 response without exposing internals", async () => {
		const { runtime } = stubRuntime(new Error("Provider stack at D:\\private\\credential.ts"));
		await withServer(runtime, async (origin) => {
			const response = await fetch(`${origin}/api/v1/support/respond`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(requiredRequest),
			});
			const body = await jsonResponse(response);
			expect(response.status).toBe(500);
			expect(body).toEqual({ error: "internal_error" });
			expect(JSON.stringify(body)).not.toContain("credential");
			expect(JSON.stringify(body)).not.toContain("D:\\private");
		});
	});

	it("drives the real SupportAgentRuntime through the HTTP boundary with a deterministic faux Pi response", async () => {
		const faux = registerFauxProvider();
		registrations.push(faux);
		faux.setResponses([
			fauxAssistantMessage(
				[{ type: "toolCall", id: "faq-1", name: "search_faq", arguments: { query: "营业时间" } }],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("门店每天 09:00-21:00 营业。"),
		]);
		const runtime = new SupportAgentRuntime({
			model: faux.getModel(),
			streamFn: streamSimple,
			retrieval: new InMemoryRetrievalService(),
			store: new InMemorySupportStore(),
			faq: [
				{
					id: "faq-business-hours",
					question: "营业时间",
					answer: "门店每天 09:00-21:00 营业。",
					status: "approved",
					version: "faq-v1",
					sourceRef: "test://faq-business-hours",
				},
			],
		});

		await withServer(runtime, async (origin) => {
			const response = await fetch(`${origin}/api/v1/support/respond`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(requiredRequest),
			});
			expect(response.status).toBe(200);
			expect(await jsonResponse(response)).toMatchObject({
				type: "answer",
				text: "门店每天 09:00-21:00 营业。",
				toolsCalled: ["search_faq"],
				evidence: [{ id: "faq-business-hours", version: "faq-v1", sourceRef: "test://faq-business-hours" }],
			});
		});
	});
});
