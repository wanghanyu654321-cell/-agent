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

export function detectSafetyRisk(text: string): SafetyRiskCategory | undefined {
	const normalized = text.toLowerCase();
	if (hasKeyword(normalized, ["过敏", "allergy", "不良反应"])) return "allergy";
	if (hasKeyword(normalized, ["皮肤异常", "skin abnormal", "红肿", "破损"])) return "skin_abnormality";
	if (hasKeyword(normalized, ["设备安全", "仪器安全", "device safety"])) return "device_safety";
	if (hasKeyword(normalized, ["禁忌", "contraindication"])) return "contraindication";
	if (hasKeyword(normalized, ["专业风险", "安全风险", "不确定", "professional risk"])) {
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
