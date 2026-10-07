import { createCipheriv, createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createStaffApi, createStaffVerifier, staffConfigFromEnv } from "../../src/channels/wecom/staff-protocol.ts";

const config = {
	corpId: "wwSynthetic",
	agentId: "1000002",
	appSecret: "synthetic-secret",
	token: "staffToken",
	encodingAesKey: Buffer.alloc(32, 7).toString("base64").slice(0, -1),
};
const now = new Date("2026-09-21T00:00:00Z");
function event(overrides: Record<string, string> = {}, receiver = config.corpId) {
	const fields = {
		ToUserName: config.corpId,
		MsgType: "event",
		Event: "template_card_event",
		FromUserName: "staff-1",
		AgentID: config.agentId,
		EventKey: "booking_confirm",
		TaskId: "task-1",
		ResponseCode: "response-1",
		...overrides,
	};
	const xml = `<xml>${Object.entries(fields)
		.map(([k, v]) => `<${k}><![CDATA[${v}]]></${k}>`)
		.join("")}</xml>`;
	const len = Buffer.alloc(4);
	len.writeUInt32BE(Buffer.byteLength(xml));
	const plain = Buffer.concat([Buffer.alloc(16), len, Buffer.from(xml), Buffer.from(receiver)]);
	const padding = 32 - (plain.length % 32);
	const aes = Buffer.from(`${config.encodingAesKey}=`, "base64");
	const cipher = createCipheriv("aes-256-cbc", aes, aes.subarray(0, 16));
	cipher.setAutoPadding(false);
	const encrypted = Buffer.concat([
		cipher.update(Buffer.concat([plain, Buffer.alloc(padding, padding)])),
		cipher.final(),
	]).toString("base64");
	const timestamp = String(now.getTime() / 1000);
	const nonce = "123";
	const signature = createHash("sha1")
		.update([config.token, timestamp, nonce, encrypted].sort().join(""))
		.digest("hex");
	const url = new URL(
		`https://example.test/callback?msg_signature=${signature}&timestamp=${timestamp}&nonce=${nonce}`,
	);
	return { url, body: `<xml><Encrypt><![CDATA[${encrypted}]]></Encrypt></xml>` };
}
describe("staff protocol", () => {
	it("is disabled by default and requires all independent staff settings when enabled", () => {
		expect(staffConfigFromEnv({ WECOM_CORP_ID: "ignored" })).toBeUndefined();
		expect(() => staffConfigFromEnv({ WECOM_STAFF_ENABLED: "true" })).toThrow();
	});
	it.each(["booking_confirm", "booking_cancel"])("verifies encrypted %s without accepting authority", (eventKey) => {
		const input = event({ EventKey: eventKey });
		expect(createStaffVerifier(config, () => now).verifyEvent(input.url, input.body)).toEqual({
			userId: "staff-1",
			agentId: config.agentId,
			eventKey,
			taskId: "task-1",
			responseCode: "response-1",
		});
	});
	it("rejects wrong AgentID, action, receiver, and signature", () => {
		const verifier = createStaffVerifier(config, () => now);
		for (const input of [
			event({ AgentID: "1000003" }),
			event({ EventKey: "propose_alternative" }),
			event({}, "wwWrong"),
		])
			expect(() => verifier.verifyEvent(input.url, input.body)).toThrow();
		const input = event();
		input.url.searchParams.set("msg_signature", "0".repeat(40));
		expect(() => verifier.verifyEvent(input.url, input.body)).toThrow();
	});
	it("sends only two buttons and updates using short-lived response code, with cached staff token", async () => {
		const requests: { url: string; body: any }[] = [];
		const fetcher = vi.fn(async (url: any, init?: RequestInit) => {
			requests.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
			return Response.json(
				String(url).includes("gettoken")
					? { errcode: 0, access_token: "synthetic-token", expires_in: 7200 }
					: { errcode: 0 },
			);
		});
		const api = createStaffApi(config, fetcher);
		expect(
			await api.sendCard({
				userId: "staff-1",
				taskId: "task-1",
				storeName: "Synthetic store",
				bookingId: "booking-1",
				service: "Synthetic service",
				start: "2026-09-25T10:00:00Z",
				end: "2026-09-25T11:00:00Z",
				version: 1,
				customerSource: "WeChat",
			}),
		).toBe("accepted");
		expect(await api.updateCard({ userId: "staff-1", responseCode: "response-1", text: "已确认" })).toBe("accepted");
		expect(requests).toHaveLength(3);
		expect(requests[1].body.template_card).toMatchObject({
			card_type: "button_interaction",
			task_id: "task-1",
			button_list: [{ key: "booking_confirm" }, { key: "booking_cancel" }],
		});
		expect(requests[2].body).toMatchObject({
			agentid: 1000002,
			response_code: "response-1",
			button: { replace_name: "已确认" },
		});
	});
	it("does not retry indeterminate outbound results", async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(Response.json({ errcode: 0, access_token: "synthetic-token", expires_in: 7200 }))
			.mockRejectedValueOnce(new Error("network"));
		expect(
			await createStaffApi(config, fetcher).updateCard({ userId: "staff-1", responseCode: "r", text: "已确认" }),
		).toBe("indeterminate");
		expect(fetcher).toHaveBeenCalledTimes(2);
	});
});

it("rejects malformed and incomplete callbacks, stale envelopes and duplicate query fields", () => {
	const verifier = createStaffVerifier(config, () => now);
	const invalidFields: Record<string, string>[] = [
		{ ResponseCode: "" },
		{ TaskId: "" },
		{ FromUserName: "@all" },
		{ MsgType: "text" },
		{ Event: "kf_msg_or_event" },
	];
	for (const overrides of invalidFields) {
		const request = event(overrides);
		expect(() => verifier.verifyEvent(request.url, request.body)).toThrow();
	}
	const duplicate = event();
	duplicate.url.searchParams.append("nonce", "second");
	expect(() => verifier.verifyEvent(duplicate.url, duplicate.body)).toThrow();
	const request = event();
	expect(() =>
		createStaffVerifier(config, () => new Date(now.getTime() + 301000)).verifyEvent(request.url, request.body),
	).toThrow();
});
it("loads independent staff config without customer-service credential fallback", () => {
	expect(
		staffConfigFromEnv({
			WECOM_STAFF_ENABLED: "true",
			WECOM_STAFF_CORP_ID: config.corpId,
			WECOM_STAFF_AGENT_ID: config.agentId,
			WECOM_STAFF_APP_SECRET: config.appSecret,
			WECOM_STAFF_CALLBACK_TOKEN: config.token,
			WECOM_STAFF_CALLBACK_AES_KEY: config.encodingAesKey,
		}),
	).toEqual(config);
	expect(() =>
		staffConfigFromEnv({
			WECOM_STAFF_ENABLED: "true",
			WECOM_CORP_ID: config.corpId,
			WECOM_KF_SECRET: config.appSecret,
		}),
	).toThrow();
	expect(() => staffConfigFromEnv({ WECOM_STAFF_ENABLED: "1" })).toThrow();
});
it.each([{ errcode: 40014 }, { errcode: 0, invaliduser: "staff-1" }])(
	"classifies explicit outbound rejection without retry",
	async (result) => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(Response.json({ errcode: 0, access_token: "synthetic-token", expires_in: 7200 }))
			.mockResolvedValueOnce(Response.json(result));
		expect(
			await createStaffApi(config, fetcher).updateCard({ userId: "staff-1", responseCode: "r", text: "已取消" }),
		).toBe("rejected");
		expect(fetcher).toHaveBeenCalledTimes(2);
	},
);
it("rejects broadcast recipients before external calls", async () => {
	const fetcher = vi.fn();
	expect(
		await createStaffApi(config, fetcher).updateCard({
			userId: "staff-1|staff-2",
			responseCode: "r",
			text: "已取消",
		}),
	).toBe("rejected");
	expect(fetcher).not.toHaveBeenCalled();
});
it("shows pending state/version and omits confirm for an incomplete requested slot", async () => {
	const fetcher = vi
		.fn()
		.mockResolvedValueOnce(Response.json({ errcode: 0, access_token: "synthetic-token", expires_in: 7200 }))
		.mockResolvedValue(Response.json({ errcode: 0 }));
	const api = createStaffApi(config, fetcher);
	const input = {
		userId: "staff-1",
		taskId: "task-no-slot",
		storeName: "Synthetic store",
		bookingId: "booking-1",
		service: "Synthetic service",
		start: null,
		end: null,
		version: 1,
		customerSource: "WeChat",
	};
	expect(await api.sendCard(input)).toBe("accepted");
	const payload = JSON.parse(fetcher.mock.calls[1][1].body);
	expect(payload.template_card.main_title.desc).toContain("pending_confirmation");
	expect(payload.template_card.main_title.desc).toContain("v1");
	expect(payload.template_card.button_list).toEqual([{ text: "取消", style: 2, key: "booking_cancel" }]);
	expect(await api.sendCard({ ...input, version: 0 })).toBe("rejected");
	expect(fetcher).toHaveBeenCalledTimes(2);
});

it.each(["S".repeat(200), "😀".repeat(200)])(
	"renders a bounded service summary for a legal long booking value",
	async (service) => {
		let payload: any;
		const fetcher: typeof fetch = async (url, init) => {
			if (String(url).includes("gettoken"))
				return Response.json({ errcode: 0, access_token: "synthetic-token", expires_in: 7200 });
			payload = JSON.parse(String(init?.body));
			return Response.json({ errcode: 0 });
		};
		expect(
			await createStaffApi(config, fetcher).sendCard({
				userId: "staff-1",
				taskId: "task-long",
				storeName: "Synthetic store",
				bookingId: "booking-1",
				service,
				start: null,
				end: null,
				version: 1,
				customerSource: "other",
			}),
		).toBe("accepted");
		const summary = payload.template_card.horizontal_content_list.find((item: any) => item.keyname === "服务").value;
		expect(summary.length).toBeLessThanOrEqual(128);
		expect(summary.isWellFormed()).toBe(true);
		expect(summary.endsWith("…")).toBe(true);
		expect(service.startsWith(summary.slice(0, -1))).toBe(true);
	},
);
