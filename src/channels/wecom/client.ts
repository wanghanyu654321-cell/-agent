import type { WeComKfMessageEvent } from "./crypto.ts";

const WECOM_API_ORIGIN = "https://qyapi.weixin.qq.com";
const DEFAULT_TIMEOUT_MS = 4000;
const ACCESS_TOKEN_SAFETY_WINDOW_MS = 5 * 60 * 1000;

export interface WeComSyncedText {
	messageId: string;
	openKfId: string;
	externalUserId: string;
	sentAtUnix: number;
	origin?: number;
	text: string;
}

export interface WeComSyncResult {
	messageCount: number;
	textMessages: WeComSyncedText[];
	hasMore: boolean;
	nextCursor?: string;
}

export interface WeComKfClient {
	syncMessages(event: WeComKfMessageEvent): Promise<WeComSyncResult>;
}

export interface WeComKfClientOptions {
	corpId: string;
	secret: string;
	fetch?: (input: string | URL, init?: RequestInit) => Promise<Response>;
	now?: () => number;
	timeoutMs?: number;
}

export function weComKfClientFromEnv(
	env: NodeJS.ProcessEnv = process.env,
	fetchFn: (input: string | URL, init?: RequestInit) => Promise<Response> = fetch,
): WeComKfClient | undefined {
	const secret = env.WECOM_KF_SECRET?.trim();
	if (!secret) return undefined;
	const corpId = env.WECOM_CORP_ID?.trim();
	if (!corpId) throw new Error("WECOM_CORP_ID is required when WECOM_KF_SECRET is configured.");
	return createWeComKfClient({ corpId, secret, fetch: fetchFn });
}

export function createWeComKfClient(options: WeComKfClientOptions): WeComKfClient {
	const corpId = validateCredential("WECOM_CORP_ID", options.corpId, 128);
	const secret = validateCredential("WECOM_KF_SECRET", options.secret, 256);
	const fetchFn = options.fetch ?? fetch;
	const now = options.now ?? Date.now;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	if (!Number.isInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 15_000) {
		throw new Error("WeCom API timeout must be an integer between 500 and 15000 milliseconds.");
	}

	let cachedAccessToken: { value: string; expiresAtMs: number } | undefined;

	async function accessToken(forceRefresh = false): Promise<string> {
		const current = cachedAccessToken;
		if (!forceRefresh && current && current.expiresAtMs - now() > ACCESS_TOKEN_SAFETY_WINDOW_MS) return current.value;

		const url = new URL("/cgi-bin/gettoken", WECOM_API_ORIGIN);
		url.searchParams.set("corpid", corpId);
		url.searchParams.set("corpsecret", secret);
		const response = await fetchFn(url, { method: "GET", signal: AbortSignal.timeout(timeoutMs) });
		if (!response.ok) throw new Error("wecom_access_token_unavailable");
		const body = await readJson(response);
		if (body.errcode !== 0) throw new Error("wecom_access_token_unavailable");
		const value = boundedString(body.access_token, 2048);
		const expiresIn = boundedPositiveInteger(body.expires_in, 24 * 60 * 60);
		cachedAccessToken = { value, expiresAtMs: now() + expiresIn * 1000 };
		return value;
	}

	async function syncOnce(event: WeComKfMessageEvent, refresh: boolean): Promise<WeComSyncResult> {
		const token = await accessToken(refresh);
		const url = new URL("/cgi-bin/kf/sync_msg", WECOM_API_ORIGIN);
		url.searchParams.set("access_token", token);
		const response = await fetchFn(url, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				token: event.token,
				limit: 1000,
				voice_format: 0,
				open_kfid: event.openKfId,
			}),
			signal: AbortSignal.timeout(timeoutMs),
		});
		if (!response.ok) throw new Error("wecom_sync_unavailable");
		const body = await readJson(response);
		if (body.errcode === 40014 || body.errcode === 42001) {
			if (refresh) throw new Error("wecom_sync_unavailable");
			cachedAccessToken = undefined;
			return syncOnce(event, true);
		}
		if (body.errcode !== 0) throw new Error("wecom_sync_unavailable");
		return parseSyncResult(body, event.openKfId);
	}

	return {
		syncMessages(event: WeComKfMessageEvent): Promise<WeComSyncResult> {
			validateCredential("wecom_event_token", event.token, 2048);
			validateCredential("wecom_open_kfid", event.openKfId, 128);
			return syncOnce(event, false);
		},
	};
}

function parseSyncResult(body: Record<string, unknown>, expectedOpenKfId: string): WeComSyncResult {
	if (!Array.isArray(body.msg_list)) throw new Error("wecom_sync_unavailable");
	const textMessages: WeComSyncedText[] = [];
	for (const item of body.msg_list) {
		if (!item || typeof item !== "object" || Array.isArray(item)) continue;
		const message = item as Record<string, unknown>;
		if (message.msgtype !== "text" || message.open_kfid !== expectedOpenKfId) continue;
		if (!message.text || typeof message.text !== "object" || Array.isArray(message.text)) continue;
		const externalUserId = optionalBoundedString(message.external_userid, 256);
		const messageId = optionalBoundedString(message.msgid, 256);
		const text = optionalBoundedString((message.text as Record<string, unknown>).content, 4000);
		const sentAtUnix = optionalPositiveInteger(message.send_time, Number.MAX_SAFE_INTEGER);
		if (!externalUserId || !messageId || !text || sentAtUnix === undefined) continue;
		const origin = optionalPositiveInteger(message.origin, 100);
		textMessages.push({
			messageId,
			openKfId: expectedOpenKfId,
			externalUserId,
			sentAtUnix,
			...(origin === undefined ? {} : { origin }),
			text,
		});
	}
	const hasMore = body.has_more === 1;
	const nextCursor = optionalBoundedString(body.next_cursor, 4096);
	return {
		messageCount: body.msg_list.length,
		textMessages,
		hasMore,
		...(nextCursor ? { nextCursor } : {}),
	};
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
	let value: unknown;
	try {
		value = await response.json();
	} catch {
		throw new Error("wecom_api_invalid_response");
	}
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("wecom_api_invalid_response");
	return value as Record<string, unknown>;
}

function validateCredential(name: string, value: string, maxLength: number): string {
	if (
		value !== value.trim() ||
		value.length < 1 ||
		value.length > maxLength ||
		value.includes("\0") ||
		!value.isWellFormed()
	) {
		throw new Error(`${name} is invalid.`);
	}
	return value;
}

function boundedString(value: unknown, maxLength: number): string {
	const result = optionalBoundedString(value, maxLength);
	if (!result) throw new Error("wecom_api_invalid_response");
	return result;
}

function optionalBoundedString(value: unknown, maxLength: number): string | undefined {
	return typeof value === "string" &&
		value.length > 0 &&
		value.length <= maxLength &&
		!value.includes("\0") &&
		value.isWellFormed()
		? value
		: undefined;
}

function boundedPositiveInteger(value: unknown, max: number): number {
	const result = optionalPositiveInteger(value, max);
	if (result === undefined || result < 1) throw new Error("wecom_api_invalid_response");
	return result;
}

function optionalPositiveInteger(value: unknown, max: number): number | undefined {
	return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max ? value : undefined;
}
