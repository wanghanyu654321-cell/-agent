import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { publicBenchmarkCases } from "../../../retrieval/public-benchmark.ts";
import { loadHoldout as loadHoldoutV1 } from "../holdout-v1/holdout.ts";

export const HOLDOUT_V21_EVIDENCE_PATH = join(import.meta.dirname, "evidence", "evidence.json");
export const HOLDOUT_V21_CASES_PATH = join(import.meta.dirname, "cases.json");

export const FUTURE_GATE_V21 = {
	positivePrimary: { correct: 18, wrong: 0, abstain: 0 },
	abstainPrimary: { correct: 6, unsupportedSelection: 0 },
	positiveReversed: { correct: 18, wrong: 0, abstain: 0 },
	abstainReversed: { correct: 6, unsupportedSelection: 0 },
	futurePrimaryCalls: 24,
	futureReversedCalls: 24,
	futureTotalCalls: 48,
	invalid: 0,
	providerError: 0,
	timeout: 0,
	orderInducedWrong: 0,
	orderInducedOutcomeDisagreement: 0,
} as const;

export type HoldoutEvidenceV21 = {
	evidenceId: string;
	title: string;
	content: string;
	sourceRef: string;
	sourceType: "OFFICIAL_FIRST_PARTY";
	version: string;
	effectiveDate?: string;
	retrievedAt: string;
	platform: string;
	proposition: string;
	whyNewVsOldBenchmark: string;
	allowedForHoldoutOnly: true;
	runtimeAdmission: false;
};

export type HoldoutCaseV21 = {
	caseId: string;
	query: string;
	queryIntent: string;
	candidateEvidenceIds: string[];
	expectedSelection: string;
	goldDirectness: "direct" | "none";
	goldSufficiency: "sufficient" | "insufficient";
	requiresUnsupportedInference: boolean;
	goldReason: string;
	distractorReasons: string[];
	sourceRefs: string[];
	noveltyReason: string;
	noveltyVerdict: "NEW" | "TOO_CLOSE";
};

export function loadHoldoutEvidenceV21(): HoldoutEvidenceV21[] {
	return JSON.parse(readFileSync(HOLDOUT_V21_EVIDENCE_PATH, "utf8")) as HoldoutEvidenceV21[];
}

export function loadHoldoutV21(): HoldoutCaseV21[] {
	return JSON.parse(readFileSync(HOLDOUT_V21_CASES_PATH, "utf8")) as HoldoutCaseV21[];
}

function sha256(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function evidencePackHashV21(): string {
	return sha256(HOLDOUT_V21_EVIDENCE_PATH);
}

export function holdoutCasesHashV21(): string {
	return sha256(HOLDOUT_V21_CASES_PATH);
}

export function reverseHoldoutCaseV21(item: HoldoutCaseV21): HoldoutCaseV21 {
	return { ...item, candidateEvidenceIds: [...item.candidateEvidenceIds].reverse() };
}

/**
 * V2.1 is a repaired successor to the pre-run V2 freeze. Its carried-forward
 * cases are still unexposed to the model; novelty is audited as a first-exposure
 * property against public and V1 populations, not as a claim that identical
 * pre-run V2 source text never existed.
 */
export function validateHoldoutV21(cases = loadHoldoutV21(), evidence = loadHoldoutEvidenceV21()): void {
	const evidenceIds = new Set(evidence.map((entry) => entry.evidenceId));
	const publicQueries = new Set(publicBenchmarkCases.map((entry) => entry.query.trim()));
	const v1Queries = new Set(loadHoldoutV1().map((entry) => entry.query.trim()));
	const positives = cases.filter((item) => item.expectedSelection !== "ABSTAIN");
	const abstains = cases.filter((item) => item.expectedSelection === "ABSTAIN");

	if (evidence.length !== 14 || new Set(evidence.map((entry) => entry.evidenceId)).size !== evidence.length) {
		throw new Error("Holdout V2.1 requires exactly 14 uniquely identified evidence records.");
	}
	for (const entry of evidence) {
		if (
			!entry.evidenceId ||
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
		) {
			throw new Error(`Malformed V2.1 holdout-only evidence: ${entry.evidenceId}`);
		}
	}

	if (cases.length !== 24 || new Set(cases.map((item) => item.caseId)).size !== 24) {
		throw new Error("Holdout V2.1 must contain exactly 24 uniquely identified cases.");
	}
	if (new Set(cases.map((item) => item.query.trim())).size !== 24) {
		throw new Error("Holdout V2.1 queries must be unique.");
	}
	if (positives.length !== 18 || abstains.length !== 6) {
		throw new Error("Holdout V2.1 must contain exactly 18 positive and 6 ABSTAIN cases.");
	}

	for (const item of cases) {
		if (publicQueries.has(item.query.trim()) || v1Queries.has(item.query.trim())) {
			throw new Error(`Holdout V2.1 query is not first-exposure novel: ${item.caseId}`);
		}
		if (
			item.candidateEvidenceIds.length < 2 ||
			item.candidateEvidenceIds.length > 3 ||
			new Set(item.candidateEvidenceIds).size !== item.candidateEvidenceIds.length ||
			item.candidateEvidenceIds.some((id) => !evidenceIds.has(id))
		) {
			throw new Error(`Holdout V2.1 candidate set is invalid: ${item.caseId}`);
		}
		if (
			!item.queryIntent.trim() ||
			!item.goldDirectness ||
			!item.goldSufficiency ||
			typeof item.requiresUnsupportedInference !== "boolean" ||
			!item.goldReason.trim() ||
			!item.noveltyReason.trim() ||
			item.noveltyVerdict !== "NEW" ||
			item.sourceRefs.length === 0 ||
			item.sourceRefs.some((sourceRef) => !sourceRef.startsWith("https://rules-center.meituan.com/")) ||
			item.distractorReasons.some((reason) => !reason.trim())
		) {
			throw new Error(`Holdout V2.1 semantic contract is incomplete: ${item.caseId}`);
		}

		const reversed = reverseHoldoutCaseV21(item);
		if (
			reversed.caseId !== item.caseId ||
			reversed.query !== item.query ||
			reversed.expectedSelection !== item.expectedSelection ||
			reversed.goldDirectness !== item.goldDirectness ||
			reversed.goldSufficiency !== item.goldSufficiency ||
			reversed.requiresUnsupportedInference !== item.requiresUnsupportedInference ||
			reversed.candidateEvidenceIds.join("\u0000") === item.candidateEvidenceIds.join("\u0000") ||
			item.candidateEvidenceIds.some((id) => !reversed.candidateEvidenceIds.includes(id))
		) {
			throw new Error(`Holdout V2.1 reverse invariant failed: ${item.caseId}`);
		}

		if (item.expectedSelection === "ABSTAIN") {
			if (
				item.goldDirectness !== "none" ||
				item.goldSufficiency !== "insufficient" ||
				item.requiresUnsupportedInference !== true ||
				item.distractorReasons.length !== item.candidateEvidenceIds.length
			) {
				throw new Error(`Holdout V2.1 ABSTAIN contract is invalid: ${item.caseId}`);
			}
		} else if (
			item.goldDirectness !== "direct" ||
			item.goldSufficiency !== "sufficient" ||
			item.requiresUnsupportedInference !== false ||
			item.candidateEvidenceIds.filter((id) => id === item.expectedSelection).length !== 1 ||
			item.distractorReasons.length !== item.candidateEvidenceIds.length - 1
		) {
			throw new Error(`Holdout V2.1 positive contract is invalid: ${item.caseId}`);
		}
	}

	for (const [evidenceId, count] of Object.entries(Object.groupBy(positives, (item) => item.expectedSelection))) {
		if (count && count.length > 2) throw new Error(`Evidence proposition is reused too often: ${evidenceId}`);
	}
}
