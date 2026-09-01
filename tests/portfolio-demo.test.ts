import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { SupportAgentRuntime, type SupportRequest } from "../src/index.ts";
import {
	createPortfolioDemoComposition,
	type PortfolioDemoComposition,
	portfolioDemoDefaultIdentity,
	portfolioDemoScenarios,
	resolvePortfolioDemoPort,
} from "../src/portfolio-demo.ts";

const compositions: PortfolioDemoComposition[] = [];
let conversationIndex = 0;

afterEach(async () => {
	while (compositions.length > 0) await compositions.pop()?.close();
	conversationIndex = 0;
});

function createDemo(): PortfolioDemoComposition {
	const composition = createPortfolioDemoComposition();
	compositions.push(composition);
	return composition;
}

function request(text: string, overrides: Partial<SupportRequest> = {}): SupportRequest {
	return {
		conversationId: `demo-${++conversationIndex}`,
		...portfolioDemoDefaultIdentity,
		text,
		...overrides,
	};
}

async function reserveEphemeralPort(): Promise<number> {
	const server = createServer();
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address() as AddressInfo;
	await new Promise<void>((resolveClose, rejectClose) => {
		server.close((error) => (error ? rejectClose(error) : resolveClose()));
	});
	return address.port;
}

describe("Portfolio V1 deterministic demo composition", () => {
	it("creates a real SupportAgentRuntime and exposes exactly seven frontend-safe scenarios", () => {
		const composition = createDemo();
		expect(composition.runtime).toBeInstanceOf(SupportAgentRuntime);
		expect(portfolioDemoScenarios).toHaveLength(7);
		expect(portfolioDemoScenarios.map((scenario) => scenario.id)).toEqual([
			"faq-business-hours",
			"single-refund-timing",
			"no-governed-evidence",
			"ambiguous-refund-rules",
			"safety-escalation",
			"ticket-creation",
			"human-handoff",
		]);
		expect(portfolioDemoScenarios.every((scenario) => "requiredPermissions" in scenario)).toBe(true);
	});

	it("answers the FAQ scenario through the real FAQ tool with synthetic demo provenance", async () => {
		const result = await createDemo().run(request("请问门店营业时间？"));
		expect(result.type).toBe("answer");
		expect(result.toolsCalled).toContain("search_faq");
		expect(result.evidence).toEqual([
			{
				id: "demo-faq-business-hours",
				kind: "faq",
				version: "demo-v1",
				sourceRef: "demo://portfolio/faq/business-hours",
			},
		]);
	});

	it("grounds the single knowledge scenario in exactly one governed demo record", async () => {
		const result = await createDemo().run(request("退款一般多久到账？"));
		expect(result.type).toBe("answer");
		expect(result.toolsCalled).toContain("search_knowledge");
		expect(result.text).toBe("DEMO / SYNTHETIC PORTFOLIO DATA：退款申请在五个工作日内按演示规则处理。");
		expect(result.evidence).toEqual([
			{
				id: "demo-policy-refund-timing",
				kind: "policy",
				version: "demo-v1",
				sourceRef: "demo://portfolio/policy/refund-timing",
			},
		]);
	});

	it("fails closed for the no-governed-evidence scenario", async () => {
		const result = await createDemo().run(request("门店有免费停车位吗？"));
		expect(result.type).toBe("fallback");
		expect(result.toolsCalled).toContain("search_knowledge");
		expect(result.evidence).toEqual([]);
		expect(result.text).not.toContain("停车");
	});

	it("uses real bounded routing rather than composition fallback for ambiguous governed evidence", async () => {
		const composition = createDemo();
		const result = await composition.run(request("这个退款到底应该按哪个规则处理？"));
		expect(composition.runtime).toBeInstanceOf(SupportAgentRuntime);
		expect(result.type).toBe("fallback");
		expect(result.toolsCalled).toEqual(["search_knowledge"]);
		expect(result.evidence).toEqual([]);
		expect(result.text).not.toContain("规则 A");
		expect(result.text).not.toContain("规则 B");
	});

	it("uses the real safety detector and Runtime handoff path for the safety scenario", async () => {
		const composition = createDemo();
		const result = await composition.run(request("顾客做项目时皮肤越来越痒，我该怎么继续？"));
		expect(result.type).toBe("escalation");
		expect(result.text).toContain("暂停");
		expect(result.evidence).toEqual([]);
		expect(composition.store.getHandoffs()).toHaveLength(1);
	});

	it("creates a ticket only through the authorized real tool", async () => {
		const composition = createDemo();
		const result = await composition.run(request("帮我记录一个退款售后工单", { permissions: ["tickets:write"] }));
		expect(result.type).toBe("answer");
		expect(result.toolsCalled).toContain("create_ticket");
		expect(result.text).toContain("记录售后工单");
		expect(composition.store.getTickets()).toHaveLength(1);
	});

	it("does not create a ticket when the Runtime permission gate rejects the same scenario", async () => {
		const composition = createDemo();
		await composition.run(request("帮我记录一个退款售后工单"));
		expect(composition.store.getTickets()).toEqual([]);
	});

	it("uses the real handoff tool when the handoff scenario has both required permissions", async () => {
		const composition = createDemo();
		const result = await composition.run(
			request("这个投诉我需要转人工处理", { permissions: ["handoff:write"], mayEscalate: true }),
		);
		expect(result.type).toBe("escalation");
		expect(result.toolsCalled).toContain("handoff_to_human");
		expect(composition.store.getHandoffs()).toHaveLength(1);
	});

	it("does not create a handoff when the Runtime authorization gate rejects the same scenario", async () => {
		const composition = createDemo();
		await composition.run(request("这个投诉我需要转人工处理", { permissions: ["handoff:write"] }));
		expect(composition.store.getHandoffs()).toEqual([]);
	});

	it("fails closed for unknown input without a general offline assistant answer", async () => {
		const result = await createDemo().run(request("请告诉我今天所有门店活动和价格"));
		expect(result.type).toBe("fallback");
		expect(result.evidence).toEqual([]);
	});

	it("keeps sequential scenario faux responses isolated", async () => {
		const composition = createDemo();
		const faq = await composition.run(request("请问门店营业时间？"));
		const knowledge = await composition.run(request("退款一般多久到账？"));
		expect(faq.toolsCalled).toEqual(["search_faq"]);
		expect(knowledge.toolsCalled).toEqual(["search_knowledge"]);
		expect(knowledge.text).toBe("DEMO / SYNTHETIC PORTFOLIO DATA：退款申请在五个工作日内按演示规则处理。");
	});

	it("runs a curated scenario without invoking fetch or external model transport", async () => {
		const originalFetch = globalThis.fetch;
		const calls: unknown[][] = [];
		globalThis.fetch = (async (...args: unknown[]) => {
			calls.push(args);
			throw new Error("The deterministic demo must not use fetch.");
		}) as typeof fetch;

		try {
			const result = await createDemo().run(request("请问门店营业时间？"));
			expect(result.type).toBe("answer");
			expect(calls).toEqual([]);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("uses the existing HTTP adapter to reach the real demo Runtime over an ephemeral port", async () => {
		const composition = createDemo();
		composition.server.listen(0, "127.0.0.1");
		await once(composition.server, "listening");
		const address = composition.server.address() as AddressInfo;
		const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/support/respond`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(request("请问门店营业时间？")),
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			type: "answer",
			toolsCalled: ["search_faq"],
			evidence: [{ id: "demo-faq-business-hours" }],
		});
	});

	it("starts through Node TypeScript strip mode and shuts down cleanly", async () => {
		const port = await reserveEphemeralPort();
		const child = spawn(process.execPath, ["src/portfolio-demo.ts"], {
			cwd: fileURLToPath(new URL("..", import.meta.url)),
			env: { ...process.env, PORT: String(port) },
		});
		let output = "";

		try {
			await new Promise<void>((resolveStart, rejectStart) => {
				const timeout = setTimeout(() => rejectStart(new Error(`Demo did not start: ${output}`)), 5_000);
				const collect = (chunk: Buffer) => {
					output += chunk.toString();
					if (output.includes(`http://127.0.0.1:${port}`)) {
						clearTimeout(timeout);
						resolveStart();
					}
				};
				child.stdout.on("data", collect);
				child.stderr.on("data", collect);
				child.once("error", (error) => {
					clearTimeout(timeout);
					rejectStart(error);
				});
				child.once("exit", (code) => {
					clearTimeout(timeout);
					rejectStart(new Error(`Demo exited before startup (${code}): ${output}`));
				});
			});
		} finally {
			child.kill("SIGINT");
		}

		const [code, signal] = (await once(child, "exit")) as [number | null, NodeJS.Signals | null];
		// Windows child_process may report the requested console signal instead of the
		// explicit zero exit code produced by the installed graceful-shutdown handler.
		expect(code === 0 || signal === "SIGINT").toBe(true);
	});

	it("accepts only valid integer TCP ports for the demo entrypoint", () => {
		expect(resolvePortfolioDemoPort(undefined)).toBe(3000);
		expect(resolvePortfolioDemoPort("3100")).toBe(3100);
		for (const value of ["0", "65536", "3.14", "not-a-port"]) {
			expect(() => resolvePortfolioDemoPort(value)).toThrow("PORT");
		}
	});
});
