import type { SupportResult } from "./index.ts";

export type PolicyDecision = "AUTO" | "WORKFLOW" | "HUMAN" | "SAFE_FALLBACK";

/** Bounded routing cues, not a general intent classifier. Unknown facts always fail closed. */
export function needsHuman(text: string): boolean {
	return /投诉|赔偿|赔我|补偿|预约|预订|修改|删除|取消订单|转账|扣款|管理员|complaint|compensat|book\b|reserv|delete|transfer/i.test(
		text,
	);
}

export function applyRealPolicy(
	result: SupportResult,
	facts: {
		requestText: string;
		failed: boolean;
		requiresEscalation: boolean;
		safety: "supported" | "escalate" | "fallback" | undefined;
		durableTicket: boolean;
		durableHandoff: boolean;
	},
): SupportResult {
	const respond = (policyDecision: PolicyDecision, type: SupportResult["type"], text: string): SupportResult => ({
		...result,
		policyDecision,
		type,
		text,
		evidence: [],
	});
	// Fail closed while retaining the existing professional-care instruction for Safety cases.
	if (facts.failed)
		return respond(
			"SAFE_FALLBACK",
			"fallback",
			facts.safety
				? "当前无法安全确认，请暂停当前操作并联系合格专业人员。"
				: "抱歉，当前无法确认处理结果，请稍后重试或联系人工客服。",
		);
	// Existing deterministic Safety responses retain their professional-care instructions.
	if (facts.safety)
		return {
			...result,
			policyDecision: result.type === "fallback" ? "SAFE_FALLBACK" : facts.safety === "escalate" ? "HUMAN" : "AUTO",
		};
	if (facts.durableHandoff) return respond("HUMAN", "escalation", "已为您转交人工客服跟进。");
	if (facts.requiresEscalation || needsHuman(facts.requestText)) {
		return respond(
			"HUMAN",
			"fallback",
			"该请求需要人工核实；当前尚未完成转交，请联系人工客服。不能确认预约、赔偿或其他业务操作已完成。",
		);
	}
	if (facts.durableTicket) return respond("WORKFLOW", "answer", "已创建客服工单，具体处理结果需由人工确认。");
	if (result.type === "answer" && result.evidence.length > 0) return { ...result, policyDecision: "AUTO" };
	if (/^(你好|您好|在吗|hi|hello)[！!。.?？\s]*$/i.test(facts.requestText.trim())) {
		return respond("AUTO", "answer", "您好，请问有什么可以帮您？");
	}
	return respond("SAFE_FALLBACK", "fallback", "抱歉，当前没有足够的已验证信息可以安全答复，请联系人工客服。");
}
