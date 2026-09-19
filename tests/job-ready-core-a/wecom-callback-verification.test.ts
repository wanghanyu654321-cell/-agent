import { createCipheriv, createHash } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
	createWeComCallbackVerifier,
	type WeComCallbackVerifier,
	weComCallbackVerifierFromEnv,
} from "../../src/channels/wecom/crypto.ts";
import { EnterpriseAuthService } from "../../src/enterprise/auth.ts";
import { createEnterpriseHttpServer } from "../../src/enterprise/http-api.ts";
import { InMemoryIdentityRepository } from "../../src/enterprise/identity.ts";

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

		const post = await fetch(`${origin}${request.url.pathname}`, { method: "POST" });
		expect(post.status).toBe(405);
		expect(post.headers.get("allow")).toBe("GET");
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

async function startServer(verifier: WeComCallbackVerifier): Promise<string> {
	const server = createEnterpriseHttpServer({
		auth: new EnterpriseAuthService(new InMemoryIdentityRepository()),
		wecomCallbackVerifier: verifier,
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	servers.push(server);
	const address = server.address() as AddressInfo;
	return `http://127.0.0.1:${address.port}`;
}
