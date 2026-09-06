import { describe, expect, it, vi } from "vitest";
import {
	parseVerifiedWeComText,
	WeComCore,
	type WeComCoreOptions,
	type WeComRepository,
	type WeComResolvedIdentity,
} from "../../src/channels/wecom/core.ts";
import type { SupportResult } from "../../src/index.ts";

const message = {
	corpId: "fixture-corp",
	applicationId: "fixture-app",
	externalSubjectId: "fixture-member",
	messageId: "fixture-message",
	sentAt: "2026-09-05T00:00:00.000Z",
	text: "fixture request",
};
const identity: WeComResolvedIdentity = {
	bindingId: "binding-a",
	membershipId: "membership-a",
	context: {
		actor: { userId: "user-a", role: "agent", capabilities: ["agent:invoke"] },
		scope: { tenantId: "tenant-a", storeId: "store-a" },
		request: { requestId: "request-a" },
	},
};
const result: SupportResult = {
	type: "fallback",
	text: "safe final result",
	evidence: [],
	toolsCalled: [],
	piSessionId: "fixture-session",
	sessionEvents: [],
};

function fixture() {
	const records = new Map<string, { hash: string; state: string; delivery: string; conversation?: string }>();
	const repository: WeComRepository = {
		async claim(input) {
			const existing = records.get(input.message.messageId);
			if (existing) return existing.hash === input.payloadHash ? { status: "duplicate" } : { status: "conflict" };
			records.set(input.message.messageId, { hash: input.payloadHash, state: "processing", delivery: "not_sent" });
			return { status: "claimed", id: input.message.messageId };
		},
		resolveIdentity: vi.fn(async (_message, requestId) =>
			structuredClone({ ...identity, context: { ...identity.context, request: { requestId } } }),
		),
		async attachConversation(id, _identity, conversation) {
			if (
				[...records.values()].some(
					(row) => row.state === "processing" && row.conversation === conversation.conversationId,
				)
			)
				return false;
			records.get(id)!.conversation = conversation.conversationId;
			return true;
		},
		async markDeliveryUncertain(id) {
			records.get(id)!.delivery = "indeterminate";
		},
		async finish(id, completion) {
			Object.assign(records.get(id)!, { state: completion.state, delivery: completion.deliveryState });
		},
	};
	const respond = vi.fn<WeComCoreOptions["respond"]>(async () => structuredClone(result));
	const send = vi.fn<WeComCoreOptions["outbound"]["send"]>(async () => undefined);
	const options: WeComCoreOptions = {
		repository,
		receiver: { corpId: message.corpId, applicationId: message.applicationId },
		resolveConversation: async () => ({ conversationId: "conversation-a", customerId: "customer-a" }),
		respond,
		outbound: { send },
	};
	const core = new WeComCore(options);
	return { core, records, repository, respond, send, options };
}

describe("normalized offline WeCom core (no wire protocol or live transport)", () => {
	it("rejects unknown fields, receiver mismatch, invalid times and oversized text before dispatch", async () => {
		const { core, respond, records } = fixture();
		for (const invalid of [
			{ ...message, tenantId: "spoof" },
			{ ...message, corpId: "wrong" },
			{ ...message, sentAt: "2026-02-30T00:00:00Z" },
			{ ...message, text: "x".repeat(4001) },
			{ ...message, messageId: "" },
			{ ...message, text: "\ud800" },
		]) {
			expect(await core.handle(invalid)).toEqual({ status: "blocked", category: "invalid_request" });
		}
		expect(records.size).toBe(0);
		expect(respond).not.toHaveBeenCalled();
		expect(parseVerifiedWeComText({ ...message, text: "😀".repeat(4000) }, message).text).toHaveLength(8000);
	});

	it("claims before work and uses only resolved internal authority and public outbound fields", async () => {
		const { core, respond, send, records } = fixture();
		respond.mockImplementation(async () => {
			expect(records.get(message.messageId)?.state).toBe("processing");
			return { ...result, sessionEvents: [{ type: "agent_start" }] };
		});
		expect(await core.handle(message)).toEqual({ status: "completed", resultType: "fallback" });
		expect(respond.mock.calls[0]).toMatchObject([
			{ ...identity.context, request: { requestId: expect.any(String) } },
			{ conversationId: "conversation-a", customerId: "customer-a", text: message.text },
		]);
		expect(send.mock.calls[0]?.[0]).toEqual({
			requestId: expect.any(String),
			bindingId: "binding-a",
			conversationId: "conversation-a",
			publicResult: {
				type: "fallback",
				text: result.text,
				evidence: [],
				toolsCalled: [],
				piSessionId: "fixture-session",
			},
		});
		expect(JSON.stringify(send.mock.calls)).not.toContain("sessionEvents");
		expect(records.get(message.messageId)).toMatchObject({ state: "completed", delivery: "sent" });
	});

	it("does not dispatch duplicate or changed-payload message identities", async () => {
		const { core, respond, send } = fixture();
		const outcomes = await Promise.all([core.handle(message), core.handle(message)]);
		expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["completed", "duplicate"]);
		expect(await core.handle(message)).toEqual({ status: "duplicate", category: "duplicate_event" });
		expect(await core.handle({ ...message, text: "different" })).toEqual({
			status: "blocked",
			category: "payload_conflict",
		});
		expect(respond).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenCalledTimes(1);
	});

	it("refuses overlapping dispatch to one scoped conversation", async () => {
		const { core, respond } = fixture();
		let release!: () => void;
		const pending = new Promise<void>((resolve) => {
			release = resolve;
		});
		respond.mockImplementation(async () => {
			await pending;
			return result;
		});
		const first = core.handle(message);
		await vi.waitFor(() => expect(respond).toHaveBeenCalledTimes(1));
		expect(await core.handle({ ...message, messageId: "second" })).toEqual({
			status: "blocked",
			category: "conversation_busy",
		});
		release();
		await first;
		expect(respond).toHaveBeenCalledTimes(1);
	});

	it("does not dispatch unresolved identities or invent a customer membership", async () => {
		const { core, repository, respond, send } = fixture();
		vi.mocked(repository.resolveIdentity).mockResolvedValue(undefined);
		expect(await core.handle(message)).toEqual({ status: "blocked", category: "identity_unresolved" });
		expect(respond).not.toHaveBeenCalled();
		expect(send).not.toHaveBeenCalled();
	});

	it("never retries dispatch after a failed/uncertain attempt, including a reconstructed core", async () => {
		const { core, respond, send, records, options } = fixture();
		respond.mockRejectedValue(new Error("private provider payload"));
		expect(await core.handle(message)).toEqual({ status: "blocked", category: "dispatch_unavailable" });
		expect(records.get(message.messageId)?.state).toBe("indeterminate");
		expect(await new WeComCore(options).handle(message)).toEqual({
			status: "duplicate",
			category: "duplicate_event",
		});
		expect(respond).toHaveBeenCalledTimes(1);
		expect(send).not.toHaveBeenCalled();
	});

	it("marks delivery uncertainty durably before send and never replays a lost acknowledgement", async () => {
		const { core, send, records } = fixture();
		send.mockImplementation(async () => {
			expect(records.get(message.messageId)?.delivery).toBe("indeterminate");
			throw new Error("secret transport response");
		});
		expect(await core.handle(message)).toEqual({ status: "blocked", category: "delivery_unavailable" });
		expect(await core.handle(message)).toEqual({ status: "duplicate", category: "duplicate_event" });
		expect(send).toHaveBeenCalledTimes(1);
		expect(records.get(message.messageId)).toMatchObject({ state: "indeterminate", delivery: "indeterminate" });
	});

	it("does not send if binding or membership authority changes during runtime execution", async () => {
		const { core, repository, respond, send } = fixture();
		respond.mockImplementation(async () => {
			vi.mocked(repository.resolveIdentity).mockResolvedValue(undefined);
			return result;
		});
		expect(await core.handle(message)).toEqual({ status: "blocked", category: "identity_unresolved" });
		expect(send).not.toHaveBeenCalled();
	});

	it("persistence failure stops dispatch or send and exposes only a bounded category", async () => {
		const first = fixture();
		first.repository.claim = async () => {
			throw new Error("password=private");
		};
		expect(await first.core.handle(message)).toEqual({ status: "blocked", category: "dependency_unavailable" });
		expect(first.respond).not.toHaveBeenCalled();
		const second = fixture();
		second.repository.markDeliveryUncertain = async () => {
			throw new Error("password=private");
		};
		expect(await second.core.handle(message)).toEqual({ status: "blocked", category: "dependency_unavailable" });
		expect(second.send).not.toHaveBeenCalled();
	});

	it("does not overwrite uncertain delivery persistence when its commit acknowledgement is lost", async () => {
		const { core, repository, send, records } = fixture();
		const finish = vi.spyOn(repository, "finish");
		repository.markDeliveryUncertain = async (id) => {
			records.get(id)!.delivery = "indeterminate";
			throw new Error("unknown database commit acknowledgement");
		};
		expect(await core.handle(message)).toEqual({ status: "blocked", category: "dependency_unavailable" });
		expect(send).not.toHaveBeenCalled();
		expect(records.get(message.messageId)?.delivery).toBe("indeterminate");
		expect(finish).toHaveBeenCalledWith(message.messageId, expect.objectContaining({ resultType: "fallback" }));
	});
});
