import {
	createWeComCallbackVerifier,
	decodeEncodingAesKey,
	decryptMessage,
	encryptedXmlValue,
	parseEventQuery,
	validateTimestamp,
	verifySignature,
	xmlField,
} from "./crypto.ts";

export interface StaffConfig {
	corpId: string;
	agentId: string;
	appSecret: string;
	token: string;
	encodingAesKey: string;
}
export interface StaffEvent {
	userId: string;
	agentId: string;
	taskId: string;
	eventKey: "booking_confirm" | "booking_cancel";
	responseCode: string;
}
export type StaffDelivery = "accepted" | "rejected" | "indeterminate";
export interface StaffApi {
	sendCard(input: {
		userId: string;
		taskId: string;
		storeName: string;
		bookingId: string;
		service: string;
		start: string | null;
		end: string | null;
		version: number;
		customerSource: string;
	}): Promise<StaffDelivery>;
	updateCard(input: { userId: string; responseCode: string; text: string }): Promise<StaffDelivery>;
}
function bounded(value: unknown, max: number): string {
	if (
		typeof value !== "string" ||
		!value ||
		value.length > max ||
		value !== value.trim() ||
		/[\u0000-\u001f]/.test(value) ||
		!value.isWellFormed()
	)
		throw new Error("invalid_staff_value");
	return value;
}
function userId(value: string): string {
	bounded(value, 128);
	if (value.includes("|") || value === "@all") throw new Error("invalid_staff_recipient");
	return value;
}
function validateConfig(config: StaffConfig): void {
	createWeComCallbackVerifier(config);
	if (!/^[1-9]\d{0,9}$/.test(config.agentId) || !Number.isSafeInteger(Number(config.agentId)))
		throw new Error("invalid_staff_agent_id");
	bounded(config.appSecret, 256);
}
export function staffConfigFromEnv(env: NodeJS.ProcessEnv = process.env): StaffConfig | undefined {
	if (env.WECOM_STAFF_ENABLED === undefined || env.WECOM_STAFF_ENABLED === "false") return undefined;
	if (env.WECOM_STAFF_ENABLED !== "true") throw new Error("WECOM_STAFF_ENABLED must be true or false");
	const config: StaffConfig = {
		corpId: env.WECOM_STAFF_CORP_ID ?? "",
		agentId: env.WECOM_STAFF_AGENT_ID ?? "",
		appSecret: env.WECOM_STAFF_APP_SECRET ?? "",
		token: env.WECOM_STAFF_CALLBACK_TOKEN ?? "",
		encodingAesKey: env.WECOM_STAFF_CALLBACK_AES_KEY ?? "",
	};
	validateConfig(config);
	return config;
}
export function createStaffVerifier(config: StaffConfig, now: () => Date = () => new Date()) {
	validateConfig(config);
	const urlVerifier = createWeComCallbackVerifier({ ...config, now });
	const aes = decodeEncodingAesKey(config.encodingAesKey);
	return {
		verifyUrl: (url: URL) => urlVerifier.verifyUrl(url),
		verifyEvent(url: URL, body: string): StaffEvent {
			const query = parseEventQuery(url);
			validateTimestamp(query.timestamp, now(), 300);
			const encrypted = encryptedXmlValue(body);
			verifySignature(config.token, query.timestamp, query.nonce, encrypted, query.msgSignature);
			const xml = decryptMessage(encrypted, aes, config.corpId);
			if (
				/<!DOCTYPE|<!ENTITY/i.test(xml) ||
				xmlField(xml, "ToUserName", 128) !== config.corpId ||
				xmlField(xml, "MsgType", 32) !== "event" ||
				xmlField(xml, "Event", 64) !== "template_card_event"
			)
				throw new Error("invalid_request");
			const agentId = xmlField(xml, "AgentID", 16);
			const eventKey = xmlField(xml, "EventKey", 64);
			if (agentId !== config.agentId || (eventKey !== "booking_confirm" && eventKey !== "booking_cancel"))
				throw new Error("invalid_request");
			return {
				userId: userId(xmlField(xml, "FromUserName", 128)),
				agentId,
				eventKey,
				taskId: bounded(xmlField(xml, "TaskId", 128), 128),
				responseCode: bounded(xmlField(xml, "ResponseCode", 2048), 2048),
			};
		},
	};
}
export function createStaffApi(config: StaffConfig, fetchImpl: typeof fetch = fetch): StaffApi {
	validateConfig(config);
	let cached: { value: string; expiresAt: number } | undefined;
	async function token(): Promise<string> {
		if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;
		const url = new URL("https://qyapi.weixin.qq.com/cgi-bin/gettoken");
		url.searchParams.set("corpid", config.corpId);
		url.searchParams.set("corpsecret", config.appSecret);
		const response = await fetchImpl(url, { signal: AbortSignal.timeout(4000), redirect: "error" });
		if (!response.ok) throw new Error("staff_token_unavailable");
		const body = (await response.json()) as Record<string, unknown>;
		if (
			body.errcode !== 0 ||
			!Number.isInteger(body.expires_in) ||
			Number(body.expires_in) <= 0 ||
			Number(body.expires_in) > 86400
		)
			throw new Error("staff_token_unavailable");
		cached = { value: bounded(body.access_token, 2048), expiresAt: Date.now() + Number(body.expires_in) * 1000 };
		return cached.value;
	}
	async function post(path: string, payload: unknown): Promise<StaffDelivery> {
		let accessToken: string;
		try {
			accessToken = await token();
		} catch {
			return "rejected";
		}
		try {
			const url = new URL(path, "https://qyapi.weixin.qq.com");
			url.searchParams.set("access_token", accessToken);
			const response = await fetchImpl(url, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload),
				signal: AbortSignal.timeout(4000),
				redirect: "error",
			});
			if (!response.ok) return "indeterminate";
			const body = (await response.json()) as Record<string, unknown>;
			if (!body || !Number.isInteger(body.errcode)) return "indeterminate";
			if (body.errcode !== 0) {
				if (body.errcode === 40014 || body.errcode === 42001) cached = undefined;
				return "rejected";
			}
			if (body.invaliduser || body.invalidparty || body.invalidtag || body.unlicenseduser) return "rejected";
			return "accepted";
		} catch {
			return "indeterminate";
		}
	}
	return {
		async sendCard(input) {
			let service: string;
			try {
				userId(input.userId);
				bounded(input.taskId, 128);
				bounded(input.storeName, 64);
				bounded(input.bookingId, 128);
				bounded(input.service, 400);
				if (Array.from(input.service).length > 200) throw new Error("invalid_service");
				service = input.service;
				if (service.length > 128) {
					service = service.slice(0, 127);
					if (!service.isWellFormed()) service = service.slice(0, -1);
					service += "…";
				}
				bounded(input.customerSource, 64);
				if (!Number.isSafeInteger(input.version) || input.version < 1) throw new Error("invalid_version");
				if (input.start !== null) bounded(input.start, 64);
				if (input.end !== null) bounded(input.end, 64);
			} catch {
				return "rejected";
			}
			return post("/cgi-bin/message/send", {
				touser: input.userId,
				msgtype: "template_card",
				agentid: Number(config.agentId),
				template_card: {
					card_type: "button_interaction",
					main_title: {
						title: "预约意向待处理",
						desc: `${input.storeName} · pending_confirmation · v${input.version}`,
					},
					task_id: input.taskId,
					horizontal_content_list: [
						{ keyname: "预约编号", value: input.bookingId },
						{ keyname: "服务", value: service },
						{ keyname: "开始", value: input.start ?? "待核实" },
						{ keyname: "结束", value: input.end ?? "待核实" },
						{ keyname: "来源", value: input.customerSource },
					],
					button_list: [
						...(input.start !== null && input.end !== null
							? [{ text: "确认", style: 1, key: "booking_confirm" }]
							: []),
						{ text: "取消", style: 2, key: "booking_cancel" },
					],
				},
			});
		},
		async updateCard(input) {
			try {
				userId(input.userId);
				bounded(input.responseCode, 2048);
				bounded(input.text, 32);
			} catch {
				return "rejected";
			}
			return post("/cgi-bin/message/update_template_card", {
				userids: [input.userId],
				agentid: Number(config.agentId),
				response_code: input.responseCode,
				button: { replace_name: input.text },
			});
		},
	};
}
