import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadPublicBenchmarkEntries, publicBenchmarkCases } from "../../../retrieval/public-benchmark.ts";

export const HOLDOUT_PATH = join(import.meta.dirname, "cases.json");

export const FUTURE_GATE = {
	positivePrimary: { correct: 24, wrong: 0, abstain: 0 },
	abstainPrimary: { correct: 6, unsupportedSelection: 0 },
	positiveReversed: { correct: 24, wrong: 0, abstain: 0 },
	abstainReversed: { correct: 6, unsupportedSelection: 0 },
	futurePrimaryCalls: 30,
	futureReversedCalls: 30,
	futureTotalCalls: 60,
	wrong: 0,
	invalid: 0,
	providerError: 0,
	timeout: 0,
	orderInducedWrong: 0,
	orderInducedOutcomeDisagreement: 0,
} as const;

type Selection = "ABSTAIN" | string;
type GoldDirectness = "direct" | "partial";
type GoldSufficiency = "sufficient" | "insufficient";

type RawHoldoutCase = {
	caseId: string;
	query: string;
	queryIntent: string;
	candidateEvidenceIds: string[];
	expectedSelection: Selection;
	goldReason: string;
	distractorReasons: string[];
};

export type HoldoutCase = RawHoldoutCase & {
	goldDirectness: GoldDirectness;
	goldSufficiency: GoldSufficiency;
	requiresUnsupportedInference: boolean;
};

function holdoutContract(
	item: RawHoldoutCase,
): Pick<HoldoutCase, "goldDirectness" | "goldSufficiency" | "requiresUnsupportedInference"> {
	return item.expectedSelection === "ABSTAIN"
		? {
				goldDirectness: "partial",
				goldSufficiency: "insufficient",
				requiresUnsupportedInference: true,
			}
		: {
				goldDirectness: "direct",
				goldSufficiency: "sufficient",
				requiresUnsupportedInference: false,
			};
}

export function loadHoldout(): HoldoutCase[] {
	const raw = JSON.parse(readFileSync(HOLDOUT_PATH, "utf8")) as RawHoldoutCase[];
	return raw.map((item) => ({ ...item, ...holdoutContract(item) }));
}

export function holdoutHash(): string {
	return createHash("sha256").update(readFileSync(HOLDOUT_PATH)).digest("hex");
}

export function reverseHoldoutCase(item: HoldoutCase): HoldoutCase {
	return { ...item, candidateEvidenceIds: [...item.candidateEvidenceIds].reverse() };
}

export function validateHoldout(cases = loadHoldout()): void {
	const corpusEvidenceIds = new Set(loadPublicBenchmarkEntries().map((entry) => entry.id));
	const publicQueries = new Set(publicBenchmarkCases.map((entry) => entry.query.trim()));
	const positiveCases = cases.filter((item) => item.expectedSelection !== "ABSTAIN");
	const abstainCases = cases.filter((item) => item.expectedSelection === "ABSTAIN");

	if (cases.length !== 30 || new Set(cases.map((item) => item.caseId)).size !== 30) {
		throw new Error("Holdout must contain exactly 30 uniquely identified cases.");
	}
	if (new Set(cases.map((item) => item.query.trim())).size !== 30) {
		throw new Error("Holdout queries must be unique.");
	}
	if (positiveCases.length !== 24 || abstainCases.length !== 6) {
		throw new Error("Holdout must contain exactly 24 positive cases and 6 ABSTAIN cases.");
	}

	for (const item of cases) {
		if (publicQueries.has(item.query.trim())) {
			throw new Error(`Holdout query collides with public benchmark: ${item.caseId}`);
		}
		if (
			item.candidateEvidenceIds.length < 2 ||
			item.candidateEvidenceIds.length > 3 ||
			new Set(item.candidateEvidenceIds).size !== item.candidateEvidenceIds.length
		) {
			throw new Error(`Holdout candidate cardinality is invalid: ${item.caseId}`);
		}
		if (item.candidateEvidenceIds.some((id) => !corpusEvidenceIds.has(id))) {
			throw new Error(`Holdout candidate is not in approved corpus: ${item.caseId}`);
		}
		if (!item.goldReason.trim() || item.distractorReasons.some((reason) => !reason.trim())) {
			throw new Error(`Holdout rationale is incomplete: ${item.caseId}`);
		}

		const reversed = reverseHoldoutCase(item);
		if (
			reversed.query !== item.query ||
			reversed.expectedSelection !== item.expectedSelection ||
			new Set(reversed.candidateEvidenceIds).size !== new Set(item.candidateEvidenceIds).size ||
			item.candidateEvidenceIds.some((id) => !reversed.candidateEvidenceIds.includes(id)) ||
			reversed.candidateEvidenceIds.join("\u0000") === item.candidateEvidenceIds.join("\u0000")
		) {
			throw new Error(`Holdout reverse invariant failed: ${item.caseId}`);
		}

		if (item.expectedSelection === "ABSTAIN") {
			if (
				item.goldDirectness !== "partial" ||
				item.goldSufficiency !== "insufficient" ||
				!item.requiresUnsupportedInference ||
				item.distractorReasons.length !== item.candidateEvidenceIds.length
			) {
				throw new Error(`ABSTAIN case is not explicitly insufficient: ${item.caseId}`);
			}
			continue;
		}

		if (
			item.goldDirectness !== "direct" ||
			item.goldSufficiency !== "sufficient" ||
			item.requiresUnsupportedInference ||
			!item.candidateEvidenceIds.includes(item.expectedSelection) ||
			item.distractorReasons.length !== item.candidateEvidenceIds.length - 1
		) {
			throw new Error(`Positive case is not directly and sufficiently grounded: ${item.caseId}`);
		}
	}
}
