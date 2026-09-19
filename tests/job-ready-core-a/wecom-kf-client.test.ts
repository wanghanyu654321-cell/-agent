import { describe, expect, it } from "vitest";
import { createWeComKfClient, weComKfClientFromEnv } from "../../src/channels/wecom/client.ts";

describe("WeChat Customer Service API client", () => {
	it("uses the customer-service secret for access_token and normalizes the first sync_msg text page", async () => {
		const calls: Array<{ url: URL; init?: RequestInit }> = [];
		const client = createWeComKfClient({
			corpId: "ww0123456789abcdef",
			secret: "customerServiceSecret",
			now: () => 1_000_000,
			fetch: async (input, init) => {
				const url = new URL(input.toString());
				calls.push({ url, init });
				if (url.pathname === "/cgi-bin/gettoken") {
					return Response.json({ errcode: 0, errmsg: "ok", access_token: "access-token", expires_in: 7200 });
				}
				expect(url.pathname).toBe("/cgi-bin/kf/sync_msg");
				return Response.json({
					errcode: 0,
					errmsg: "ok",
					has_more: 0,
					next_cursor: "cursor-next",
					msg_list: [
						{
							msgid: "message-1",
							open_kfid: "wk0123456789abcdef",
							external_userid: "wm-customer-1",
							send_time: 1_726_700_000,
							origin: 3,
							msgtype: "text",
							text: { content: "请问门店营业时间？" },
						},
					],
				});
			},
		});

		const result = await client.syncMessages({
			token: "sync-token",
			openKfId: "wk0123456789abcdef",
			createdAtUnix: 1_726_700_001,
		});

		expect(result).toEqual({
			messageCount: 1,
			textMessages: [
				{
					messageId: "message-1",
					openKfId: "wk0123456789abcdef",
					externalUserId: "wm-customer-1",
					sentAtUnix: 1_726_700_000,
					origin: 3,
					text: "请问门店营业时间？",
				},
			],
			hasMore: false,
			nextCursor: "cursor-next",
		});
		expect(calls).toHaveLength(2);
		expect(calls[0]!.url.searchParams.get("corpid")).toBe("ww0123456789abcdef");
		expect(calls[0]!.url.searchParams.get("corpsecret")).toBe("customerServiceSecret");
		expect(JSON.parse(String(calls[1]!.init?.body))).toEqual({
			token: "sync-token",
			limit: 1000,
			voice_format: 0,
			open_kfid: "wk0123456789abcdef",
		});
	});

	it("loads no client without WECOM_KF_SECRET and never requires exposing the secret to callback verification", () => {
		expect(weComKfClientFromEnv({ WECOM_CORP_ID: "ww0123456789abcdef" })).toBeUndefined();
		expect(() => weComKfClientFromEnv({ WECOM_KF_SECRET: "secret-only" })).toThrow("WECOM_CORP_ID is required");
	});
});
