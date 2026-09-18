import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { publicBenchmarkCases } from "../../../retrieval/public-benchmark.ts";
import { loadHoldout as loadHoldoutV1 } from "../holdout-v1/holdout.ts";
import { loadHoldoutV2 } from "../holdout-v2/holdout.ts";
import { loadHoldoutV21 } from "../holdout-v2.1/holdout.ts";
import { loadHoldoutV22 } from "../holdout-v2.2-boundary/holdout.ts";

export const HOLDOUT_V231_FINAL_EVIDENCE_PATH = join(import.meta.dirname, "evidence.json");
export const HOLDOUT_V231_FINAL_CASES_PATH = join(import.meta.dirname, "cases.json");

export const FINAL_UNSEEN_GATE_V231 = {
	clearDirectAnswerPrimary: { correct: 4, wrong: 0, abstain: 0 },
	trueInsufficiencyPrimary: { correct: 4, unsupportedSelection: 0 },
	hardRelatedInsufficientPrimary: { correct: 4, unsupportedSelection: 0 },
	clearDirectAnswerReversed: { correct: 4, wrong: 0, abstain: 0 },
	trueInsufficiencyReversed: { correct: 4, unsupportedSelection: 0 },
	hardRelatedInsufficientReversed: { correct: 4, unsupportedSelection: 0 },
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

export type FinalBoundaryType = "CLEAR_DIRECT_ANSWER" | "TRUE_INSUFFICIENCY" | "HARD_RELATED_INSUFFICIENT";

export type FinalHoldoutEvidence = {
	evidenceId: string;
	title: string;
	content: string;
	sourceRef: string;
	sourceType: "OFFICIAL_FIRST_PARTY";
	version: string;
	retrievedAt: string;
	platform: "Meituan";
	proposition: string;
	whyNewVsHistoricalPopulations: string;
	allowedForHoldoutOnly: true;
	runtimeAdmission: false;
};

export type FinalHoldoutCase = {
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
	boundaryType: FinalBoundaryType;
	boundaryReason: string;
	sourceRefs: string[];
	noveltyReason: string;
	noveltyVerdict: "NEW";
};

export function loadHoldoutEvidenceV231Final(): FinalHoldoutEvidence[] {
	return JSON.parse(readFileSync(HOLDOUT_V231_FINAL_EVIDENCE_PATH, "utf8")) as FinalHoldoutEvidence[];
}

export function loadHoldoutV231Final(): FinalHoldoutCase[] {
	return JSON.parse(readFileSync(HOLDOUT_V231_FINAL_CASES_PATH, "utf8")) as FinalHoldoutCase[];
}

function sha256(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function evidencePackHashV231Final(): string {
	return sha256(HOLDOUT_V231_FINAL_EVIDENCE_PATH);
}

export function holdoutCasesHashV231Final(): string {
	return sha256(HOLDOUT_V231_FINAL_CASES_PATH);
}

export function reverseHoldoutCaseV231Final(item: FinalHoldoutCase): FinalHoldoutCase {
	return { ...item, candidateEvidenceIds: [...item.candidateEvidenceIds].reverse() };
}

function historicalQueries(): Set<string> {
	return new Set([
		...publicBenchmarkCases.map((item) => item.query.trim()),
		...loadHoldoutV1().map((item) => item.query.trim()),
		...loadHoldoutV2().map((item) => item.query.trim()),
		...loadHoldoutV21().map((item) => item.query.trim()),
		...loadHoldoutV22().map((item) => item.query.trim()),
	]);
}

/** Structural freeze validation only; semantic truth stays in the human contract audit. */
export function validateHoldoutV231Final(
	cases = loadHoldoutV231Final(),
	evidence = loadHoldoutEvidenceV231Final(),
): void {
	const evidenceIds = new Set(evidence.map((entry) => entry.evidenceId));
	const priorQueries = historicalQueries();
	const countByBoundary = (boundaryType: FinalBoundaryType) =>
		cases.filter((item) => item.boundaryType === boundaryType).length;

	if (evidence.length !== 12 || evidenceIds.size !== evidence.length)
		throw new Error("Final V2.3.1 holdout requires exactly 12 uniquely identified evidence records.");
	for (const entry of evidence) {
		if (
			!entry.evidenceId.startsWith("HF231-") ||
			!entry.title.trim() ||
			!entry.content.trim() ||
			!entry.sourceRef.startsWith("https://rules-center.meituan.com/") ||
			entry.sourceType !== "OFFICIAL_FIRST_PARTY" ||
			!entry.version.trim() ||
			!entry.retrievedAt.trim() ||
			entry.platform !== "Meituan" ||
			!entry.proposition.trim() ||
			!entry.whyNewVsHistoricalPopulations.trim() ||
			entry.allowedForHoldoutOnly !== true ||
			entry.runtimeAdmission !== false
		)
			throw new Error(`Malformed final V2.3.1 holdout evidence: ${entry.evidenceId}`);
		if (/(?:规则)?(?:没有|未)(?:说明|给出|规定|披露)|(?:具体|固定|统一)(?:天数|数值|金额|公式)/.test(entry.content))
			throw new Error(`Model-visible absence assertion is forbidden: ${entry.evidenceId}`);
	}

	if (cases.length !== 12 || new Set(cases.map((item) => item.caseId)).size !== 12)
		throw new Error("Final V2.3.1 holdout requires exactly 12 uniquely identified primary cases.");
	if (new Set(cases.map((item) => item.query.trim())).size !== 12)
		throw new Error("Final V2.3.1 holdout queries must be unique.");
	if (
		countByBoundary("CLEAR_DIRECT_ANSWER") !== 4 ||
		countByBoundary("TRUE_INSUFFICIENCY") !== 4 ||
		countByBoundary("HARD_RELATED_INSUFFICIENT") !== 4
	)
		throw new Error("Final V2.3.1 holdout requires the exact 4/4/4 boundary split.");

	for (const item of cases) {
		if (priorQueries.has(item.query.trim()))
			throw new Error(`Final V2.3.1 query collides with history: ${item.caseId}`);
		if (
			!item.caseId.startsWith("final-v2.3.1-") ||
			!item.queryIntent.trim() ||
			!item.goldReason.trim() ||
			!item.boundaryReason.trim() ||
			!item.noveltyReason.trim() ||
			item.noveltyVerdict !== "NEW" ||
			item.sourceRefs.length === 0 ||
			item.sourceRefs.some((sourceRef) => !sourceRef.startsWith("https://rules-center.meituan.com/")) ||
			item.distractorReasons.some((reason) => !reason.trim()) ||
			item.candidateEvidenceIds.length < 2 ||
			item.candidateEvidenceIds.length > 3 ||
			new Set(item.candidateEvidenceIds).size !== item.candidateEvidenceIds.length ||
			item.candidateEvidenceIds.some((id) => !evidenceIds.has(id))
		)
			throw new Error(`Final V2.3.1 structural contract is incomplete: ${item.caseId}`);

		const reversed = reverseHoldoutCaseV231Final(item);
		if (
			reversed.candidateEvidenceIds.join("\u0000") === item.candidateEvidenceIds.join("\u0000") ||
			item.candidateEvidenceIds.some((id) => !reversed.candidateEvidenceIds.includes(id))
		)
			throw new Error(`Final V2.3.1 reverse invariant failed: ${item.caseId}`);

		const isSelect = item.boundaryType === "CLEAR_DIRECT_ANSWER";
		if (
			(isSelect &&
				(item.expectedSelection === "ABSTAIN" ||
					item.goldDirectness !== "direct" ||
					item.goldSufficiency !== "sufficient" ||
					item.requiresUnsupportedInference ||
					!item.candidateEvidenceIds.includes(item.expectedSelection) ||
					item.distractorReasons.length !== item.candidateEvidenceIds.length - 1)) ||
			(!isSelect &&
				(item.expectedSelection !== "ABSTAIN" ||
					item.goldDirectness !== "none" ||
					item.goldSufficiency !== "insufficient" ||
					!item.requiresUnsupportedInference ||
					item.distractorReasons.length !== item.candidateEvidenceIds.length))
		)
			throw new Error(`Final V2.3.1 boundary shape is invalid: ${item.caseId}`);
	}
}
