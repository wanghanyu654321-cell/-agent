import { createCipheriv, createHash } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WeComKfClient } from "../../src/channels/wecom/client.ts";
import {
	createWeComCallbackVerifier,
	type WeComCallbackVerifier,
	weComCallbackVerifierFromEnv,
} from "../../src/channels/wecom/crypto.ts";
import type { WeComCustomerRouter } from "../../src/channels/wecom/customer.ts";
import { EnterpriseAuthService } from "../../src/enterprise/auth.ts";
import type { EnterpriseSupportPort } from "../../src/enterprise/business.ts";
import { createEnterpriseHttpServer } from "../../src/enterprise/http-api.ts";
import { createSupportExecutionContext, InMemoryIdentityRepository } from "../../src/enterprise/identity.ts";

const CORP_ID = "ww0123456789abcdef";
const TOKEN = "callbackToken123";
const ENCODING_AES_KEY = Buffer.from("0123456789abcdef0123456789abcdef", "utf8").toString("base64").slice(0, -1);
const NOW = new Date("2026-09-19T04:32:00.000Z");
const NONCE = "123456789";

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
	vi.restoreAllMocks();
});

describe("WeChat Customer Service callback URL verification", () => {
	it("verifies the official SHA1 envelope, decrypts AES-CBC and returns only the echo plaintext", () => {
		const verifier = verifierFixture();
		const request = callbackFixture({ message: "verified-echo" });
		expect(verifier.verifyUrl(request.url)).toBe("verified-echo");
	});

	it("fails closed on tampering, wrong receiveId, stale time, unknown fields and duplicate fields", () => {
		const verifier = verifierFixture();
		const valid = callbackFixture();

		const badSignature = new URL(valid.url);
		badSignature.searchParams.set("msg_signature", "0".repeat(40));
		expect(() => verifier.verifyUrl(badSignature)).toThrow("invalid_request");

		const wrongReceiver = callbackFixture({ receiveId: "ww-other-receiver" });
		expect(() => verifier.verifyUrl(wrongReceiver.url)).toThrow("invalid_request");

		const stale = callbackFixture({ timestamp: String(Math.floor(NOW.getTime() / 1000) - 301) });
		expect(() => verifier.verifyUrl(stale.url)).toThrow("invalid_request");

		const unknown = new URL(valid.url);
		unknown.searchParams.set("tenantId", "spoof");
		expect(() => verifier.verifyUrl(unknown)).toThrow("invalid_request");

		const duplicate = new URL(valid.url);
		duplicate.searchParams.append("nonce", "second");
		expect(() => verifier.verifyUrl(duplicate)).toThrow("invalid_request");
	});

	it("verifies and decrypts the kf_msg_or_event POST envelope without exposing the sync token", () => {
		const verifier = verifierFixture();
		const request = eventFixture();
		expect(verifier.verifyEvent(request.url, request.body)).toEqual({
			token: "syncToken123",
			openKfId: "wk0123456789abcdef",
			createdAtUnix: Math.floor(NOW.getTime() / 1000),
		});

		const tampered = new URL(request.url);
		tampered.searchParams.set("msg_signature", "0".repeat(40));
		expect(() => verifier.verifyEvent(tampered, request.body)).toThrow("invalid_request");
	});

	it("loads callback secrets only as one complete host-side configuration set", () => {
		expect(weComCallbackVerifierFromEnv({})).toBeUndefined();
		expect(() => weComCallbackVerifierFromEnv({ WECOM_CORP_ID: CORP_ID })).toThrow("must be configured together");
		expect(() =>
			weComCallbackVerifierFromEnv({
				WECOM_CORP_ID: CORP_ID,
				WECOM_CALLBACK_TOKEN: TOKEN,
				WECOM_CALLBACK_AES_KEY: "x".repeat(42),
			}),
		).toThrow("WECOM_CALLBACK_AES_KEY is invalid");
		expect(
			weComCallbackVerifierFromEnv({
				WECOM_CORP_ID: CORP_ID,
				WECOM_CALLBACK_TOKEN: TOKEN,
				WECOM_CALLBACK_AES_KEY: ENCODING_AES_KEY,
			}),
		).toBeDefined();
		expect(
			weComCallbackVerifierFromEnv({
				WECOM_CORP_ID: CORP_ID,
				WECOM_CALLBACK_TOKEN: TOKEN,
				WECOM_CALLBACK_AES_KEY: `${"A".repeat(42)}B`,
			}),
		).toBeDefined();
	});

	it("mounts the unauthenticated GET callback route with exact plaintext success and bounded failures", async () => {
		const verifier = verifierFixture();
		const origin = await startServer(verifier);
		const request = callbackFixture({ message: "wire-ok" });
		const response = await fetch(`${origin}${request.url.pathname}?${request.url.searchParams.toString()}`);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(await response.text()).toBe("wire-ok");

		const invalid = new URL(request.url);
		invalid.searchParams.set("msg_signature", "f".repeat(40));
		const rejected = await fetch(`${origin}${invalid.pathname}?${invalid.searchParams.toString()}`);
		expect(rejected.status).toBe(400);
		const rejectedBody = await rejected.text();
		expect(rejectedBody).toContain("invalid_request");
		expect(rejectedBody).not.toContain(request.echostr);

		const event = eventFixture();
		const post = await fetch(`${origin}${event.url.pathname}?${event.url.searchParams.toString()}`, {
			method: "POST",
			headers: { "content-type": "text/xml; charset=utf-8" },
			body: event.body,
		});
		expect(post.status).toBe(200);
		expect(await post.text()).toBe("success");

		const put = await fetch(`${origin}${request.url.pathname}`, { method: "PUT" });
		expect(put.status).toBe(405);
		expect(put.headers.get("allow")).toBe("GET, POST");
	});
	it("claims, executes and completes synced customer text only once across callback replay without logging contents", async () => {
		const verifier = verifierFixture();
		let alreadyClaimed = false;
		let attached = 0;
		let completed = 0;
		let executed = 0;
		const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
		const customerText = {
			corpId: CORP_ID,
			messageId: "message-private-1",
			openKfId: "wk0123456789abcdef",
			externalUserId: "wm-private-customer",
			sentAtUnix: Math.floor(NOW.getTime() / 1000),
			origin: 3 as const,
			text: "private customer text",
		};
		const customerRouter: WeComCustomerRouter = {
			async claim() {
				if (alreadyClaimed) return { status: "duplicate" };
				alreadyClaimed = true;
				return { status: "claimed", id: "claim-1" };
			},
			async resolveRoute(_message, requestId) {
				return {
					channelBindingId: "channel-a",
					customerBindingId: "customer-binding-a",
					customerId: "customer-a",
					conversationId: "conversation-a",
					context: createSupportExecutionContext(
						{
							id: "demo-membership-alice-a1",
							userId: "demo-user-alice-agent",
							tenantId: "demo-tenant-a",
							storeId: "demo-store-a1",
							role: "agent",
							createdAt: NOW,
						},
						requestId,
					),
				};
			},
			async attachRoute() {
				attached += 1;
				return true;
			},
			async complete(_claimId, resultType) {
				completed += 1;
				expect(resultType).toBe("answer");
				return true;
			},
			async markFailed() {
				throw new Error("markFailed must not run for the routed fixture");
			},
		};
		const origin = await startServer(verifier, {
			wecomKfClient: {
				async syncMessages() {
					return { messageCount: 1, textMessages: [customerText], hasMore: false };
				},
			},
			wecomCustomerRouter: customerRouter,
			supportService: supportServiceFixture(async (context, input) => {
				executed += 1;
				expect(context.scope).toEqual({ tenantId: "demo-tenant-a", storeId: "demo-store-a1" });
				expect(input).toEqual({
					conversationId: "conversation-a",
					customerId: "customer-a",
					text: customerText.text,
				});
				return {
					type: "answer",
					text: "private answer must not be logged",
					piSessionId: "session-a",
					toolsCalled: [],
					sessionEvents: [],
					evidence: [],
				};
			}),
		});
		const event = eventFixture();

		for (let attempt = 0; attempt < 2; attempt += 1) {
			const response = await fetch(`${origin}${event.url.pathname}?${event.url.searchParams.toString()}`, {
				method: "POST",
				headers: { "content-type": "text/xml; charset=utf-8" },
				body: event.body,
			});
			expect(response.status).toBe(200);
			expect(await response.text()).toBe("success");
		}

		expect(attached).toBe(1);
		expect(executed).toBe(1);
		expect(completed).toBe(1);
		const logs = info.mock.calls.flat().join("\n");
		expect(logs).toContain('"routed":1');
		expect(logs).toContain('"completed":1');
		expect(logs).toContain('"duplicates":1');
		expect(logs).not.toContain(customerText.messageId);
		expect(logs).not.toContain(customerText.externalUserId);
		expect(logs).not.toContain(customerText.text);
		expect(logs).not.toContain("private answer must not be logged");
	});
});

function verifierFixture(): WeComCallbackVerifier {
	return createWeComCallbackVerifier({
		corpId: CORP_ID,
		token: TOKEN,
		encodingAesKey: ENCODING_AES_KEY,
		now: () => NOW,
	});
}

function callbackFixture(
	overrides: { message?: string; receiveId?: string; timestamp?: string; nonce?: string } = {},
): { url: URL; echostr: string } {
	const message = overrides.message ?? "echo";
	const receiveId = overrides.receiveId ?? CORP_ID;
	const timestamp = overrides.timestamp ?? String(Math.floor(NOW.getTime() / 1000));
	const nonce = overrides.nonce ?? NONCE;
	const echostr = encrypt(message, receiveId);
	const msgSignature = createHash("sha1").update([TOKEN, timestamp, nonce, echostr].sort().join("")).digest("hex");
	const url = new URL("https://frontagent.cn/api/v1/channels/wecom/callback");
	url.searchParams.set("msg_signature", msgSignature);
	url.searchParams.set("timestamp", timestamp);
	url.searchParams.set("nonce", nonce);
	url.searchParams.set("echostr", echostr);
	return { url, echostr };
}

function eventFixture(
	overrides: { receiveId?: string; timestamp?: string; nonce?: string; token?: string; openKfId?: string } = {},
): { url: URL; body: string } {
	const receiveId = overrides.receiveId ?? CORP_ID;
	const timestamp = overrides.timestamp ?? String(Math.floor(NOW.getTime() / 1000));
	const nonce = overrides.nonce ?? NONCE;
	const token = overrides.token ?? "syncToken123";
	const openKfId = overrides.openKfId ?? "wk0123456789abcdef";
	const payload = [
		"<xml>",
		`<ToUserName><![CDATA[${CORP_ID}]]></ToUserName>`,
		`<CreateTime>${timestamp}</CreateTime>`,
		"<MsgType><![CDATA[event]]></MsgType>",
		"<Event><![CDATA[kf_msg_or_event]]></Event>",
		`<Token><![CDATA[${token}]]></Token>`,
		`<OpenKfId><![CDATA[${openKfId}]]></OpenKfId>`,
		"</xml>",
	].join("");
	const encrypted = encrypt(payload, receiveId);
	const msgSignature = createHash("sha1").update([TOKEN, timestamp, nonce, encrypted].sort().join("")).digest("hex");
	const url = new URL("https://frontagent.cn/api/v1/channels/wecom/callback");
	url.searchParams.set("msg_signature", msgSignature);
	url.searchParams.set("timestamp", timestamp);
	url.searchParams.set("nonce", nonce);
	const body = `<xml><Encrypt><![CDATA[${encrypted}]]></Encrypt></xml>`;
	return { url, body };
}

function encrypt(message: string, receiveId: string): string {
	const aesKey = Buffer.from(`${ENCODING_AES_KEY}=`, "base64");
	const messageBytes = Buffer.from(message, "utf8");
	const length = Buffer.alloc(4);
	length.writeUInt32BE(messageBytes.length);
	const plaintext = Buffer.concat([Buffer.alloc(16, 7), length, messageBytes, Buffer.from(receiveId, "utf8")]);
	const paddingLength = 32 - (plaintext.length % 32);
	const padded = Buffer.concat([plaintext, Buffer.alloc(paddingLength, paddingLength)]);
	const cipher = createCipheriv("aes-256-cbc", aesKey, aesKey.subarray(0, 16));
	cipher.setAutoPadding(false);
	return Buffer.concat([cipher.update(padded), cipher.final()]).toString("base64");
}

function supportServiceFixture(
	respond: EnterpriseSupportPort["respond"] = async () => {
		throw new Error("unexpected customer message");
	},
): EnterpriseSupportPort {
	return {
		respond,
		async listConversations() {
			return [];
		},
		async listTickets() {
			return [];
		},
		async listHandoffs() {
			return [];
		},
		async listAuditEvents() {
			return [];
		},
	};
}

async function startServer(
	verifier: WeComCallbackVerifier,
	dependencies: {
		wecomKfClient?: WeComKfClient;
		wecomCustomerRouter?: WeComCustomerRouter;
		supportService?: EnterpriseSupportPort;
	} = {},
): Promise<string> {
	const defaultCustomerRouter: WeComCustomerRouter = {
		async claim() {
			throw new Error("unexpected customer message");
		},
		async resolveRoute() {
			throw new Error("unexpected customer message");
		},
		async attachRoute() {
			throw new Error("unexpected customer message");
		},
		async complete() {
			throw new Error("unexpected customer message");
		},
		async markFailed() {
			throw new Error("unexpected customer message");
		},
	};
	const server = createEnterpriseHttpServer({
		auth: new EnterpriseAuthService(new InMemoryIdentityRepository()),
		wecomCallbackVerifier: verifier,
		wecomKfClient:
			dependencies.wecomKfClient ??
			({
				async syncMessages() {
					return { messageCount: 1, textMessages: [], hasMore: false };
				},
			} satisfies WeComKfClient),
		wecomCustomerRouter: dependencies.wecomCustomerRouter ?? defaultCustomerRouter,
		supportService: dependencies.supportService ?? supportServiceFixture(),
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	servers.push(server);
	const address = server.address() as AddressInfo;
	return `http://127.0.0.1:${address.port}`;
}
