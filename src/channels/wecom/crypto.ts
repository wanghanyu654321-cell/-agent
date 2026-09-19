import { createDecipheriv, createHash, timingSafeEqual } from "node:crypto";

const CALLBACK_FIELDS = ["msg_signature", "timestamp", "nonce", "echostr"] as const;
const DEFAULT_MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const MAX_ECHOSTR_CHARS = 8192;
const MAX_NONCE_CHARS = 128;

export interface WeComKfMessageEvent {
	token: string;
	openKfId: string;
	createdAtUnix: number;
}

export interface WeComCallbackVerifier {
	verifyUrl(url: URL): string;
	verifyEvent(url: URL, encryptedBody: string): WeComKfMessageEvent;
}

export interface WeComCallbackVerifierOptions {
	corpId: string;
	token: string;
	encodingAesKey: string;
	now?: () => Date;
	maxClockSkewSeconds?: number;
}

export function weComCallbackVerifierFromEnv(env: NodeJS.ProcessEnv = process.env): WeComCallbackVerifier | undefined {
	const corpId = env.WECOM_CORP_ID?.trim();
	const token = env.WECOM_CALLBACK_TOKEN?.trim();
	const encodingAesKey = env.WECOM_CALLBACK_AES_KEY?.trim();
	const provided = [corpId, token, encodingAesKey].filter((value) => value !== undefined && value.length > 0).length;
	if (provided === 0) return undefined;
	if (provided !== 3) {
		throw new Error("WECOM_CORP_ID, WECOM_CALLBACK_TOKEN and WECOM_CALLBACK_AES_KEY must be configured together.");
	}
	return createWeComCallbackVerifier({ corpId: corpId!, token: token!, encodingAesKey: encodingAesKey! });
}

export function createWeComCallbackVerifier(options: WeComCallbackVerifierOptions): WeComCallbackVerifier {
	const corpId = validateCorpId(options.corpId);
	const token = validateToken(options.token);
	const aesKey = decodeEncodingAesKey(options.encodingAesKey);
	const now = options.now ?? (() => new Date());
	const maxClockSkewSeconds = options.maxClockSkewSeconds ?? DEFAULT_MAX_CLOCK_SKEW_SECONDS;
	if (!Number.isInteger(maxClockSkewSeconds) || maxClockSkewSeconds < 0 || maxClockSkewSeconds > 3600) {
		throw new Error("WeCom callback max clock skew must be an integer between 0 and 3600 seconds.");
	}

	return {
		verifyUrl(url: URL): string {
			const query = parseVerificationQuery(url);
			validateTimestamp(query.timestamp, now(), maxClockSkewSeconds);
			verifySignature(token, query.timestamp, query.nonce, query.echostr, query.msgSignature);
			return decryptMessage(query.echostr, aesKey, corpId);
		},
		verifyEvent(url: URL, encryptedBody: string): WeComKfMessageEvent {
			const query = parseEventQuery(url);
			validateTimestamp(query.timestamp, now(), maxClockSkewSeconds);
			const encrypted = encryptedXmlValue(encryptedBody);
			verifySignature(token, query.timestamp, query.nonce, encrypted, query.msgSignature);
			return parseKfMessageEvent(decryptMessage(encrypted, aesKey, corpId), corpId);
		},
	};
}

function parseVerificationQuery(url: URL): {
	msgSignature: string;
	timestamp: string;
	nonce: string;
	echostr: string;
} {
	const keys = [...url.searchParams.keys()];
	if (
		keys.length !== CALLBACK_FIELDS.length ||
		keys.some((key) => !CALLBACK_FIELDS.includes(key as (typeof CALLBACK_FIELDS)[number]))
	) {
		throw new Error("invalid_request");
	}
	for (const field of CALLBACK_FIELDS) {
		if (url.searchParams.getAll(field).length !== 1) throw new Error("invalid_request");
	}
	const msgSignature = boundedQueryValue(url, "msg_signature", 40);
	if (!/^[a-fA-F0-9]{40}$/.test(msgSignature)) throw new Error("invalid_request");
	const timestamp = boundedQueryValue(url, "timestamp", 20);
	if (!/^\d{1,20}$/.test(timestamp)) throw new Error("invalid_request");
	const nonce = boundedQueryValue(url, "nonce", MAX_NONCE_CHARS);
	const echostr = boundedQueryValue(url, "echostr", MAX_ECHOSTR_CHARS);
	if (echostr.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(echostr)) throw new Error("invalid_request");
	return { msgSignature, timestamp, nonce, echostr };
}

function parseEventQuery(url: URL): {
	msgSignature: string;
	timestamp: string;
	nonce: string;
} {
	const fields = CALLBACK_FIELDS.slice(0, 3);
	const keys = [...url.searchParams.keys()];
	if (keys.length !== fields.length || keys.some((key) => !fields.includes(key as (typeof fields)[number]))) {
		throw new Error("invalid_request");
	}
	for (const field of fields) {
		if (url.searchParams.getAll(field).length !== 1) throw new Error("invalid_request");
	}
	const msgSignature = boundedQueryValue(url, "msg_signature", 40);
	if (!/^[a-fA-F0-9]{40}$/.test(msgSignature)) throw new Error("invalid_request");
	const timestamp = boundedQueryValue(url, "timestamp", 20);
	if (!/^\d{1,20}$/.test(timestamp)) throw new Error("invalid_request");
	const nonce = boundedQueryValue(url, "nonce", MAX_NONCE_CHARS);
	return { msgSignature, timestamp, nonce };
}

function boundedQueryValue(url: URL, field: (typeof CALLBACK_FIELDS)[number], maxLength: number): string {
	const value = url.searchParams.get(field);
	if (!value || value.length > maxLength || value.includes("\0") || !value.isWellFormed())
		throw new Error("invalid_request");
	return value;
}

function validateTimestamp(timestamp: string, now: Date, maxClockSkewSeconds: number): void {
	if (!Number.isFinite(now.getTime())) throw new Error("invalid_request");
	const timestampSeconds = BigInt(timestamp);
	const nowSeconds = BigInt(Math.floor(now.getTime() / 1000));
	const difference = timestampSeconds >= nowSeconds ? timestampSeconds - nowSeconds : nowSeconds - timestampSeconds;
	if (difference > BigInt(maxClockSkewSeconds)) throw new Error("invalid_request");
}

function verifySignature(
	token: string,
	timestamp: string,
	nonce: string,
	encrypted: string,
	msgSignature: string,
): void {
	const expected = createHash("sha1").update([token, timestamp, nonce, encrypted].sort().join("")).digest();
	const actual = Buffer.from(msgSignature, "hex");
	if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("invalid_request");
}

function encryptedXmlValue(body: string): string {
	if (body.length === 0 || body.length > 64 * 1024 || body.includes("\0") || !body.isWellFormed()) {
		throw new Error("invalid_request");
	}
	const matches = [
		...body.matchAll(/<Encrypt>\s*(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))\s*<\/Encrypt>/g),
	];
	if (matches.length !== 1) throw new Error("invalid_request");
	const encrypted = (matches[0]?.[1] ?? matches[0]?.[2] ?? "").trim();
	if (!encrypted || encrypted.length > MAX_ECHOSTR_CHARS || encrypted.length % 4 !== 0)
		throw new Error("invalid_request");
	if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encrypted)) throw new Error("invalid_request");
	return encrypted;
}

function decryptMessage(encrypted: string, aesKey: Buffer, corpId: string): string {
	const ciphertext = Buffer.from(encrypted, "base64");
	if (ciphertext.length === 0 || ciphertext.length % 16 !== 0) throw new Error("invalid_request");
	let padded: Buffer;
	try {
		const decipher = createDecipheriv("aes-256-cbc", aesKey, aesKey.subarray(0, 16));
		decipher.setAutoPadding(false);
		padded = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
	} catch {
		throw new Error("invalid_request");
	}
	const plaintext = stripPkcs7Padding(padded);
	if (plaintext.length < 21) throw new Error("invalid_request");
	const messageLength = plaintext.readUInt32BE(16);
	const messageStart = 20;
	const messageEnd = messageStart + messageLength;
	if (messageLength < 1 || messageEnd > plaintext.length) throw new Error("invalid_request");
	const receiveId = plaintext.subarray(messageEnd);
	const expectedReceiveId = Buffer.from(corpId, "utf8");
	if (receiveId.length !== expectedReceiveId.length || !timingSafeEqual(receiveId, expectedReceiveId)) {
		throw new Error("invalid_request");
	}
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(plaintext.subarray(messageStart, messageEnd));
	} catch {
		throw new Error("invalid_request");
	}
}

function parseKfMessageEvent(xml: string, corpId: string): WeComKfMessageEvent {
	const toUserName = xmlField(xml, "ToUserName", 128);
	if (toUserName !== corpId) throw new Error("invalid_request");
	if (xmlField(xml, "MsgType", 32) !== "event") throw new Error("invalid_request");
	if (xmlField(xml, "Event", 64) !== "kf_msg_or_event") throw new Error("invalid_request");

	const createdAtText = xmlField(xml, "CreateTime", 20);
	if (!/^\d{1,20}$/.test(createdAtText)) throw new Error("invalid_request");
	const createdAtBigInt = BigInt(createdAtText);
	if (createdAtBigInt > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("invalid_request");

	const token = xmlField(xml, "Token", 2048);
	const openKfId = xmlField(xml, "OpenKfId", 128);
	if (!token || !openKfId) throw new Error("invalid_request");

	return { token, openKfId, createdAtUnix: Number(createdAtBigInt) };
}

function xmlField(xml: string, field: string, maxLength: number): string {
	const pattern = new RegExp(
		`<${field}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))\\s*</${field}>`,
		"g",
	);
	const matches = [...xml.matchAll(pattern)];
	if (matches.length !== 1) throw new Error("invalid_request");
	const value = (matches[0]?.[1] ?? matches[0]?.[2] ?? "").trim();
	if (!value || value.length > maxLength || value.includes("\0") || !value.isWellFormed()) {
		throw new Error("invalid_request");
	}
	return value;
}

function stripPkcs7Padding(value: Buffer): Buffer {
	if (value.length === 0) throw new Error("invalid_request");
	const paddingLength = value[value.length - 1]!;
	if (paddingLength < 1 || paddingLength > 32 || paddingLength > value.length) throw new Error("invalid_request");
	for (let index = value.length - paddingLength; index < value.length; index += 1) {
		if (value[index] !== paddingLength) throw new Error("invalid_request");
	}
	return value.subarray(0, value.length - paddingLength);
}

function validateCorpId(value: string): string {
	if (
		value !== value.trim() ||
		value.length < 3 ||
		value.length > 128 ||
		!value.startsWith("ww") ||
		/[\s\0]/.test(value)
	) {
		throw new Error("WECOM_CORP_ID is invalid.");
	}
	return value;
}

function validateToken(value: string): string {
	if (!/^[A-Za-z0-9]{1,32}$/.test(value)) throw new Error("WECOM_CALLBACK_TOKEN is invalid.");
	return value;
}

function decodeEncodingAesKey(value: string): Buffer {
	if (!/^[A-Za-z0-9+/]{43}$/.test(value)) throw new Error("WECOM_CALLBACK_AES_KEY is invalid.");
	const decoded = Buffer.from(`${value}=`, "base64");
	if (decoded.length !== 32) throw new Error("WECOM_CALLBACK_AES_KEY is invalid.");
	return decoded;
}
