import { createCipheriv, createHash } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStaffVerifier } from "../../src/channels/wecom/staff-protocol.ts";
import { EnterpriseAuthService } from "../../src/enterprise/auth.ts";
import { createEnterpriseHttpServer, type EnterpriseHttpServerOptions } from "../../src/enterprise/http-api.ts";
import { InMemoryIdentityRepository } from "../../src/enterprise/identity.ts";
import { StoreOpsError } from "../../src/storeops/contracts.ts";

const config = {
	corpId: "wwSynthetic",
	agentId: "1000002",
	appSecret: "synthetic-secret",
	token: "syntheticToken",
	encodingAesKey: Buffer.alloc(32, 7).toString("base64").slice(0, -1),
};
const now = new Date("2026-09-22T00:00:00Z");
const path = "/api/v1/channels/wecom/staff/callback";
const servers: Server[] = [];
afterEach(async () => {
	await Promise.all(
		servers
			.splice(0)
			.map(
				(server) =>
					new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
			),
	);
});
function envelope(message: string, echo = false) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(Buffer.byteLength(message));
	const plain = Buffer.concat([Buffer.alloc(16), len, Buffer.from(message), Buffer.from(config.corpId)]);
	const padding = 32 - (plain.length % 32);
	const key = Buffer.from(`${config.encodingAesKey}=`, "base64");
	const cipher = createCipheriv("aes-256-cbc", key, key.subarray(0, 16));
	cipher.setAutoPadding(false);
	const encrypted = Buffer.concat([
		cipher.update(Buffer.concat([plain, Buffer.alloc(padding, padding)])),
		cipher.final(),
	]).toString("base64");
	const timestamp = String(now.getTime() / 1000);
	const nonce = "syntheticNonce";
	const signature = createHash("sha1")
		.update([config.token, timestamp, nonce, encrypted].sort().join(""))
		.digest("hex");
	const params = new URLSearchParams({ msg_signature: signature, timestamp, nonce });
	if (echo) params.set("echostr", encrypted);
	return { params, body: `<xml><Encrypt><![CDATA[${encrypted}]]></Encrypt></xml>` };
}
function callback(agentId = config.agentId) {
	const fields = {
		ToUserName: config.corpId,
		MsgType: "event",
		Event: "template_card_event",
		FromUserName: "staff-1",
		AgentID: agentId,
		EventKey: "booking_confirm",
		TaskId: "task-1",
		ResponseCode: "synthetic-response",
	};
	return envelope(
		`<xml>${Object.entries(fields)
			.map(([key, value]) => `<${key}><![CDATA[${value}]]></${key}>`)
			.join("")}</xml>`,
	);
}
async function start(staff?: EnterpriseHttpServerOptions["wecomStaff"]) {
	const server = createEnterpriseHttpServer({
		auth: new EnterpriseAuthService(new InMemoryIdentityRepository()),
		...(staff ? { wecomStaff: staff } : {}),
	});
	servers.push(server);
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
function serviceFixture() {
	return {
		handle: vi.fn().mockResolvedValue({ status: "confirmed" }),
		notify: vi.fn().mockResolvedValue({ status: "disabled" }),
	};
}
const post = (origin: string, input: ReturnType<typeof callback>) =>
	fetch(`${origin}${path}?${input.params}`, {
		method: "POST",
		headers: { "content-type": "text/xml" },
		body: input.body,
	});
describe("staff callback HTTP boundary", () => {
	it("returns 404 when disabled and keeps health available", async () => {
		const origin = await start();
		expect((await fetch(`${origin}/healthz`)).status).toBe(200);
		expect((await fetch(`${origin}${path}`)).status).toBe(404);
		expect((await post(origin, callback())).status).toBe(404);
	});
	it("decrypts GET verification and passes only verified POST event to service", async () => {
		const service = serviceFixture();
		const origin = await start({ verifier: createStaffVerifier(config, () => now), service });
		const echo = envelope("synthetic-echo", true);
		const get = await fetch(`${origin}${path}?${echo.params}`);
		expect(get.status).toBe(200);
		expect(await get.text()).toBe("synthetic-echo");
		expect(get.headers.get("cache-control")).toBe("no-store");
		expect(service.handle).not.toHaveBeenCalled();
		const response = await post(origin, callback());
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("success");
		expect(service.handle).toHaveBeenCalledExactlyOnceWith({
			userId: "staff-1",
			agentId: config.agentId,
			eventKey: "booking_confirm",
			taskId: "task-1",
			responseCode: "synthetic-response",
		});
		expect(service.notify).not.toHaveBeenCalled();
	});
	it("rejects invalid signatures and wrong application before handler", async () => {
		const service = serviceFixture();
		const origin = await start({ verifier: createStaffVerifier(config, () => now), service });
		const invalid = callback();
		invalid.params.set("msg_signature", "0".repeat(40));
		for (const request of [invalid, callback("1000003")]) {
			const response = await post(origin, request);
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({ error: "invalid_request" });
		}
		expect(service.handle).not.toHaveBeenCalled();
	});
	it("returns 403 for verified callback lacking internal authority", async () => {
		const service = serviceFixture();
		service.handle.mockRejectedValue(new StoreOpsError("forbidden"));
		const origin = await start({ verifier: createStaffVerifier(config, () => now), service });
		const response = await post(origin, callback());
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: "forbidden" });
		expect(service.handle).toHaveBeenCalledTimes(1);
	});
});
