import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { publicBenchmarkCases } from "../../../retrieval/public-benchmark.ts";
import { loadHoldout as loadHoldoutV1 } from "../holdout-v1/holdout.ts";
import { loadHoldoutV2 } from "../holdout-v2/holdout.ts";
import { loadHoldoutV21 } from "../holdout-v2.1/holdout.ts";

export const HOLDOUT_V22_EVIDENCE_PATH = join(import.meta.dirname, "evidence.json");
export const HOLDOUT_V22_CASES_PATH = join(import.meta.dirname, "cases.json");

export const FUTURE_GATE_V22 = {
	answerablePrimary: { correct: 4, wrong: 0, abstain: 0 },
	insufficiencyPrimary: { correct: 8, unsupportedSelection: 0 },
	answerableReversed: { correct: 4, wrong: 0, abstain: 0 },
	insufficiencyReversed: { correct: 8, unsupportedSelection: 0 },
	futurePrimaryCalls: 12,
	futureReversedCalls: 12,
	futureTotalCalls: 24,
	wrong: 0,
	invalid: 0,
	providerError: 0,
	timeout: 0,
	orderInducedWrong: 0,
	orderInducedOutcomeDisagreement: 0,
} as const;

export type SufficiencyBoundaryType = "ANSWERABLE_NON_UNIQUENESS" | "TRUE_INSUFFICIENCY";

export type HoldoutEvidenceV22 = {
	evidenceId: string;
	title: string;
	content: string;
	sourceRef: string;
	sourceType: "OFFICIAL_FIRST_PARTY";
	version: string;
	retrievedAt: string;
	platform: string;
	proposition: string;
	whyNewVsOldBenchmark: string;
	allowedForHoldoutOnly: true;
	runtimeAdmission: false;
};

export type HoldoutCaseV22 = {
	caseId: string;
	query: string;
	queryIntent: string;
	candidateEvidenceIds: string[];
	expectedSelection: string | "ABSTAIN";
	goldDirectness: "direct" | "none";
	goldSufficiency: "sufficient" | "insufficient";
	requiresUnsupportedInference: boolean;
	goldReason: string;
	distractorReasons: string[];
	boundaryType: SufficiencyBoundaryType;
	boundaryReason: string;
	sourceRefs: string[];
	noveltyReason: string;
	noveltyVerdict: "NEW" | "TOO_CLOSE";
};

export function loadHoldoutEvidenceV22(): HoldoutEvidenceV22[] {
	return JSON.parse(readFileSync(HOLDOUT_V22_EVIDENCE_PATH, "utf8")) as HoldoutEvidenceV22[];
}

export function loadHoldoutV22(): HoldoutCaseV22[] {
	return JSON.parse(readFileSync(HOLDOUT_V22_CASES_PATH, "utf8")) as HoldoutCaseV22[];
}

function sha256(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function evidencePackHashV22(): string {
	return sha256(HOLDOUT_V22_EVIDENCE_PATH);
}

export function holdoutCasesHashV22(): string {
	return sha256(HOLDOUT_V22_CASES_PATH);
}

export function reverseHoldoutCaseV22(item: HoldoutCaseV22): HoldoutCaseV22 {
	return { ...item, candidateEvidenceIds: [...item.candidateEvidenceIds].reverse() };
}

export function validateHoldoutV22(cases = loadHoldoutV22(), evidence = loadHoldoutEvidenceV22()): void {
	const evidenceIds = new Set(evidence.map((entry) => entry.evidenceId));
	const historicalQueries = new Set([
		...publicBenchmarkCases.map((entry) => entry.query.trim()),
		...loadHoldoutV1().map((entry) => entry.query.trim()),
		...loadHoldoutV2().map((entry) => entry.query.trim()),
		...loadHoldoutV21().map((entry) => entry.query.trim()),
	]);
	const answerable = cases.filter((item) => item.boundaryType === "ANSWERABLE_NON_UNIQUENESS");
	const insufficient = cases.filter((item) => item.boundaryType === "TRUE_INSUFFICIENCY");
	if (
		evidence.length < 8 ||
		evidence.length > 12 ||
		new Set(evidence.map((entry) => entry.evidenceId)).size !== evidence.length
	)
		throw new Error("Holdout V2.2 requires 8-12 uniquely identified official propositions.");
	for (const entry of evidence) {
		if (
			!entry.evidenceId.startsWith("H22-") ||
			!entry.title.trim() ||
			!entry.content.trim() ||
			!entry.sourceRef.startsWith("https://rules-center.meituan.com/") ||
			entry.sourceType !== "OFFICIAL_FIRST_PARTY" ||
			!entry.version.trim() ||
			!entry.retrievedAt.trim() ||
			!entry.platform.trim() ||
			!entry.proposition.trim() ||
			!entry.whyNewVsOldBenchmark.trim() ||
			entry.allowedForHoldoutOnly !== true ||
			entry.runtimeAdmission !== false
		)
			throw new Error(`Malformed V2.2 holdout-only evidence: ${entry.evidenceId}`);
	}
	if (cases.length !== 12 || new Set(cases.map((item) => item.caseId)).size !== 12)
		throw new Error("Holdout V2.2 requires exactly 12 primary cases.");
	if (new Set(cases.map((item) => item.query.trim())).size !== 12)
		throw new Error("Holdout V2.2 queries must be unique.");
	if (answerable.length !== 4 || insufficient.length !== 8)
		throw new Error("Holdout V2.2 requires exactly 4 answerable and 8 true-insufficiency cases.");
	for (const item of cases) {
		if (historicalQueries.has(item.query.trim())) throw new Error(`V2.2 query is not genuinely new: ${item.caseId}`);
		if (
			item.candidateEvidenceIds.length < 2 ||
			item.candidateEvidenceIds.length > 3 ||
			new Set(item.candidateEvidenceIds).size !== item.candidateEvidenceIds.length ||
			item.candidateEvidenceIds.some((id) => !evidenceIds.has(id))
		)
			throw new Error(`V2.2 candidate set is invalid: ${item.caseId}`);
		if (
			!item.queryIntent.trim() ||
			!item.goldReason.trim() ||
			!item.boundaryReason.trim() ||
			!item.noveltyReason.trim() ||
			item.noveltyVerdict !== "NEW" ||
			item.sourceRefs.length === 0 ||
			item.sourceRefs.some((sourceRef) => !sourceRef.startsWith("https://rules-center.meituan.com/")) ||
			item.distractorReasons.some((reason) => !reason.trim())
		)
			throw new Error(`V2.2 semantic contract is incomplete: ${item.caseId}`);
		const reversed = reverseHoldoutCaseV22(item);
		if (
			reversed.candidateEvidenceIds.join("\u0000") === item.candidateEvidenceIds.join("\u0000") ||
			item.candidateEvidenceIds.some((id) => !reversed.candidateEvidenceIds.includes(id))
		)
			throw new Error(`V2.2 reverse invariant failed: ${item.caseId}`);
		if (item.boundaryType === "ANSWERABLE_NON_UNIQUENESS") {
			if (
				item.expectedSelection === "ABSTAIN" ||
				item.goldDirectness !== "direct" ||
				item.goldSufficiency !== "sufficient" ||
				item.requiresUnsupportedInference ||
				item.candidateEvidenceIds.filter((id) => id === item.expectedSelection).length !== 1 ||
				item.distractorReasons.length !== item.candidateEvidenceIds.length - 1
			)
				throw new Error(`V2.2 answerable non-uniqueness contract is invalid: ${item.caseId}`);
		} else if (
			item.expectedSelection !== "ABSTAIN" ||
			item.goldDirectness !== "none" ||
			item.goldSufficiency !== "insufficient" ||
			!item.requiresUnsupportedInference ||
			item.distractorReasons.length !== item.candidateEvidenceIds.length
		) {
			throw new Error(`V2.2 true-insufficiency contract is invalid: ${item.caseId}`);
		}
	}
	for (const [evidenceId, count] of Object.entries(
		Object.groupBy(
			cases.flatMap((item) => item.candidateEvidenceIds),
			(id) => id,
		),
	)) {
		if (count && count.length > 2) throw new Error(`Evidence proposition is reused too often: ${evidenceId}`);
	}
}
