import type { RetrievalEvidence, RetrievalService } from "./index.ts";

export type SafetyRiskCategory =
	| "allergy"
	| "skin_abnormality"
	| "device_safety"
	| "contraindication"
	| "unknown_professional_risk";

export type SafetyKnowledgeStatus = "approved" | "synthetic_test_only" | "unapproved";

export interface SafetyOption {
	action: string;
	risk: string;
	likelyResult: string;
}

export interface SafetyKnowledgeEntry {
	id: string;
	domain: "safety";
	riskCategory: SafetyRiskCategory;
	status: SafetyKnowledgeStatus;
	version: string;
	updatedAt: string;
	scope: string[];
	evidenceText: string;
	allowedOptions: SafetyOption[];
	requiresEscalation: boolean;
}

export interface SafetyEvidence {
	id: string;
	riskCategory: SafetyRiskCategory;
	status: SafetyKnowledgeStatus;
	version: string;
	scope: string[];
	allowedOptions: SafetyOption[];
	requiresEscalation: boolean;
}

export interface SafetyDecision {
	disposition: "supported" | "escalate" | "fallback";
	riskCategory: SafetyRiskCategory;
	evidenceIds: string[];
	options: SafetyOption[];
	reason: string;
}

export interface UnsupportedClaimInspectionInput {
	finalResponse: string;
	disposition: SafetyDecision["disposition"];
	approvedOptionTexts: string[];
}

export interface UnsupportedClaimInspection {
	count: number;
	reasons: string[];
}

type SafetyDecisionEvidence = Pick<
	SafetyKnowledgeEntry,
	"id" | "riskCategory" | "status" | "scope" | "allowedOptions" | "requiresEscalation"
>;

export interface ApprovedSafetyRetrievalOptions {
	allowSyntheticTestFixtures?: boolean;
}

function hasKeyword(text: string, keywords: string[]): boolean {
	return keywords.some((keyword) => text.includes(keyword));
}

function hasSafetyHardNegative(text: string): boolean {
	return [
		/(价格|费用|服务|体验).{0,8}(不舒服|难受)/,
		/(退款|订单|政策).{0,8}(风险|过敏|不舒服)/,
		/(设备|仪器).{0,8}(送到|配送|到货|物流)/,
		/(会员|政策).{0,8}(过敏|不舒服)/,
		/皮肤管理.{0,8}(营业|几点|预约)/,
	].some((pattern) => pattern.test(text));
}

function hasDeviceRiskSignal(text: string): boolean {
	return (
		(hasKeyword(text, ["仪器", "设备", "机器"]) &&
			hasKeyword(text, ["电", "dian", "麻", "打痛", "烫", "异常", "不对劲", "怪怪", "疼", "碰"])) ||
		hasKeyword(text, ["电了一下", "像被电", "漏电", "电麻"])
	);
}

function hasContraindicationSignal(text: string): boolean {
	return (
		(/(吃过|吃着|服过|服用|在吃|吃完|服药|吃药).{0,4}药?/.test(text) &&
			/(能不能|可不可以|还能|能否|项目|做|继续|上)/.test(text)) ||
		hasKeyword(text, ["怀孕", "怀着", "哺乳"])
	);
}

export function detectSafetyRisk(text: string): SafetyRiskCategory | undefined {
	const normalized = text.toLowerCase().replace(/[\s，。！？、；：“”‘’,.!?;:'"-]/g, "");
	if (hasSafetyHardNegative(normalized)) return undefined;
	if (hasDeviceRiskSignal(normalized)) return "device_safety";
	if (hasContraindicationSignal(normalized)) return "contraindication";
	if (
		hasKeyword(normalized, [
			"过敏",
			"allergy",
			"不良反应",
			"越来越痒",
			"越做越痒",
			"痒得",
			"发痒",
			"开始痒",
			"越挠越痒",
			"抓脸",
			"痒一直",
			"yue痒",
		])
	) {
		return "allergy";
	}
	if (
		hasKeyword(normalized, [
			"皮肤异常",
			"skinabnormal",
			"红肿",
			"破损",
			"刺痛",
			"刺刺",
			"扎着疼",
			"小水泡",
			"小泡",
			"起泡",
			"冒泡",
			"泡泡",
			"鼓起来",
			"发烫",
			"特别烫",
			"很烫",
			"热得厉害",
			"烧起来",
			"红红",
			"红又烫",
			"皮都破",
			"持续觉得热",
			"脸温度很高",
		])
	) {
		return "skin_abnormality";
	}
	if (hasKeyword(normalized, ["禁忌", "contraindication"])) return "contraindication";
	if (hasKeyword(normalized, ["设备安全", "仪器安全", "devicesafety", "仪器刚刚响", "设备不对"])) {
		return "device_safety";
	}
	if (
		hasKeyword(normalized, ["专业风险", "安全风险", "不确定", "professionalrisk", "呼吸困难"]) ||
		/呼吸.{0,4}(不舒服|不适)/.test(normalized) ||
		/喘.{0,6}(不.{0,2}(舒服|适)|不上来)/.test(normalized) ||
		(/(做一半|做到半截|刚做完|刚弄完|操作中|项目中|进行时|碰到那个头)/.test(normalized) &&
			hasKeyword(normalized, ["不舒服", "难受", "不适", "怪怪", "不对劲", "不太对", "dui", "缩了一下"])) ||
		hasKeyword(normalized, [
			"喘不上来",
			"一直说喘",
			"心里没底",
			"怕不安全",
			"感觉很不对",
			"人不对劲",
			"先别弄",
			"不太dui",
			"拿不准",
			"往下做",
		]) ||
		/皮肤.{0,6}(怪怪|怪|不对)/.test(normalized)
	) {
		return "unknown_professional_risk";
	}
	return undefined;
}

function queryMatches(entry: SafetyKnowledgeEntry, query: string): boolean {
	const normalized = query.toLowerCase();
	return normalized.includes(entry.riskCategory) || detectSafetyRisk(query) === entry.riskCategory;
}

export class ApprovedSafetyRetrievalService implements RetrievalService {
	private readonly entries: SafetyKnowledgeEntry[];
	private readonly allowSyntheticTestFixtures: boolean;

	constructor(entries: SafetyKnowledgeEntry[], options: ApprovedSafetyRetrievalOptions = {}) {
		this.entries = entries;
		this.allowSyntheticTestFixtures = options.allowSyntheticTestFixtures ?? false;
	}

	async search(query: string, signal: AbortSignal): Promise<RetrievalEvidence[]> {
		if (signal.aborted) throw new Error("Safety knowledge search aborted.");
		return this.entries
			.filter((entry) => entry.domain === "safety")
			.filter(
				(entry) =>
					entry.status === "approved" ||
					(this.allowSyntheticTestFixtures && entry.status === "synthetic_test_only"),
			)
			.filter((entry) => queryMatches(entry, query))
			.map((entry) => ({
				id: entry.id,
				text: entry.evidenceText,
				safety: {
					id: entry.id,
					riskCategory: entry.riskCategory,
					status: entry.status,
					version: entry.version,
					scope: entry.scope,
					allowedOptions: entry.allowedOptions,
					requiresEscalation: entry.requiresEscalation,
				},
			}));
	}
}

export function decideSafety(
	riskCategory: SafetyRiskCategory,
	evidence: SafetyDecisionEvidence[],
	allowSyntheticTestFixtures: boolean,
	requestedScope?: string,
): SafetyDecision {
	const usable = evidence.filter(
		(entry) =>
			entry.riskCategory === riskCategory &&
			(entry.status === "approved" || (allowSyntheticTestFixtures && entry.status === "synthetic_test_only")),
	);
	const scoped = requestedScope ? usable.filter((entry) => entry.scope.includes(requestedScope)) : usable;
	const evidenceIds = scoped.map((entry) => entry.id);
	if (scoped.length === 0) {
		return {
			disposition: "escalate",
			riskCategory,
			evidenceIds: [],
			options: [],
			reason: "insufficient_approved_evidence",
		};
	}
	if (scoped.some((entry) => entry.requiresEscalation)) {
		return {
			disposition: "escalate",
			riskCategory,
			evidenceIds,
			options: [],
			reason: "knowledge_requires_qualified_human",
		};
	}
	const options = scoped.flatMap((entry) => entry.allowedOptions).slice(0, 3);
	if (options.length === 0) {
		return {
			disposition: "escalate",
			riskCategory,
			evidenceIds,
			options: [],
			reason: "evidence_has_no_allowed_option",
		};
	}
	return { disposition: "supported", riskCategory, evidenceIds, options, reason: "approved_evidence_covers_scope" };
}

export function formatSafetySupportedResponse(options: SafetyOption[]): string {
	return `以下仅为已批准资料覆盖的选项：\n${options
		.map((option, index) => `${index + 1}. ${option.action}（风险：${option.risk}；预期：${option.likelyResult}）`)
		.join("\n")}`;
}

export function inspectUnsupportedProfessionalClaims(
	input: UnsupportedClaimInspectionInput,
): UnsupportedClaimInspection {
	const reasons = new Set<string>();
	const text = input.finalResponse;
	if (input.disposition === "supported") {
		if (input.approvedOptionTexts.length === 0) reasons.add("supported_without_approved_options");
		else if (!input.approvedOptionTexts.every((option) => text.includes(option))) {
			reasons.add("approved_option_missing_from_response");
		}
		if (input.approvedOptionTexts.length === 1 && text !== input.approvedOptionTexts[0]) {
			reasons.add("supported_response_not_exactly_approved");
		}
	}
	if (input.disposition !== "supported") {
		if (/(可以|继续|照常|直接).{0,6}(操作|做|进行|项目)/.test(text) || /无需暂停|不用暂停/.test(text)) {
			reasons.add("continuation_when_pause_required");
		}
		if (/肯定|确定没问题|已经诊断|确诊/.test(text)) reasons.add("unsupported_certainty_or_diagnosis");
		if (/治疗|禁忌|仪器.{0,4}(调|用)|设备.{0,4}(调|用)|过敏.{0,4}(处理|步骤)/.test(text)) {
			reasons.add("professional_instruction_when_escalation_required");
		}
	}
	return { count: reasons.size, reasons: [...reasons] };
}
