import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { publicBenchmarkCases } from "../../../retrieval/public-benchmark.ts";
import { loadHoldout as loadHoldoutV1 } from "../holdout-v1/holdout.ts";

export const HOLDOUT_V2_EVIDENCE_PATH = join(import.meta.dirname, "evidence", "evidence.json");
export const HOLDOUT_V2_CASES_PATH = join(import.meta.dirname, "cases.json");

export const FUTURE_GATE_V2 = {
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

export type HoldoutEvidenceV2 = {
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

export type HoldoutCaseV2 = {
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

export function loadHoldoutEvidenceV2(): HoldoutEvidenceV2[] {
	return JSON.parse(readFileSync(HOLDOUT_V2_EVIDENCE_PATH, "utf8")) as HoldoutEvidenceV2[];
}

export function loadHoldoutV2(): HoldoutCaseV2[] {
	return JSON.parse(readFileSync(HOLDOUT_V2_CASES_PATH, "utf8")) as HoldoutCaseV2[];
}

function sha256(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function evidencePackHashV2(): string {
	return sha256(HOLDOUT_V2_EVIDENCE_PATH);
}

export function holdoutCasesHashV2(): string {
	return sha256(HOLDOUT_V2_CASES_PATH);
}

export function reverseHoldoutCaseV2(item: HoldoutCaseV2): HoldoutCaseV2 {
	return { ...item, candidateEvidenceIds: [...item.candidateEvidenceIds].reverse() };
}

export function validateHoldoutV2(cases = loadHoldoutV2(), evidence = loadHoldoutEvidenceV2()): void {
	const evidenceIds = new Set(evidence.map((entry) => entry.evidenceId));
	const publicQueries = new Set(publicBenchmarkCases.map((entry) => entry.query.trim()));
	const v1Queries = new Set(loadHoldoutV1().map((entry) => entry.query.trim()));
	const positives = cases.filter((item) => item.expectedSelection !== "ABSTAIN");
	const abstains = cases.filter((item) => item.expectedSelection === "ABSTAIN");

	if (evidence.length < 10 || new Set(evidence.map((entry) => entry.evidenceId)).size !== evidence.length) {
		throw new Error("Holdout V2 requires at least 10 uniquely identified evidence records.");
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
			throw new Error(`Malformed holdout-only evidence: ${entry.evidenceId}`);
		}
	}

	if (cases.length !== 24 || new Set(cases.map((item) => item.caseId)).size !== 24) {
		throw new Error("Holdout V2 must contain exactly 24 uniquely identified cases.");
	}
	if (new Set(cases.map((item) => item.query.trim())).size !== 24) {
		throw new Error("Holdout V2 queries must be unique.");
	}
	if (positives.length !== 18 || abstains.length !== 6) {
		throw new Error("Holdout V2 must contain exactly 18 positive and 6 ABSTAIN cases.");
	}

	for (const item of cases) {
		if (publicQueries.has(item.query.trim()) || v1Queries.has(item.query.trim())) {
			throw new Error(`Holdout V2 query is not unseen: ${item.caseId}`);
		}
		if (
			item.candidateEvidenceIds.length < 2 ||
			item.candidateEvidenceIds.length > 3 ||
			new Set(item.candidateEvidenceIds).size !== item.candidateEvidenceIds.length ||
			item.candidateEvidenceIds.some((id) => !evidenceIds.has(id))
		) {
			throw new Error(`Holdout V2 candidate set is invalid: ${item.caseId}`);
		}
		if (
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
			throw new Error(`Holdout V2 semantic contract is incomplete: ${item.caseId}`);
		}

		const reversed = reverseHoldoutCaseV2(item);
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
			throw new Error(`Holdout V2 reverse invariant failed: ${item.caseId}`);
		}

		if (item.expectedSelection === "ABSTAIN") {
			if (
				item.goldDirectness !== "none" ||
				item.goldSufficiency !== "insufficient" ||
				item.requiresUnsupportedInference !== true ||
				item.distractorReasons.length !== item.candidateEvidenceIds.length
			) {
				throw new Error(`Holdout V2 ABSTAIN contract is invalid: ${item.caseId}`);
			}
		} else if (
			item.goldDirectness !== "direct" ||
			item.goldSufficiency !== "sufficient" ||
			item.requiresUnsupportedInference !== false ||
			item.candidateEvidenceIds.filter((id) => id === item.expectedSelection).length !== 1 ||
			item.distractorReasons.length !== item.candidateEvidenceIds.length - 1
		) {
			throw new Error(`Holdout V2 positive contract is invalid: ${item.caseId}`);
		}
	}

	for (const [evidenceId, count] of Object.entries(Object.groupBy(positives, (item) => item.expectedSelection))) {
		if (count && count.length > 2) throw new Error(`Evidence proposition is reused too often: ${evidenceId}`);
	}
}
