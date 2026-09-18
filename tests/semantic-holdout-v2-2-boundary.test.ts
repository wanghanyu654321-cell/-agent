import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	evidencePackHashV22,
	FUTURE_GATE_V22,
	holdoutCasesHashV22,
	loadHoldoutEvidenceV22,
	loadHoldoutV22,
	reverseHoldoutCaseV22,
	validateHoldoutV22,
} from "../evals/selection/semantic/holdout-v2.2-boundary/holdout.ts";

describe("sufficiency boundary holdout v2.2", () => {
	it("pins exactly 12 new holdout-only cases and the 24-call integer Gate", () => {
		const evidence = loadHoldoutEvidenceV22();
		const cases = loadHoldoutV22();
		const manifest = JSON.parse(
			readFileSync(
				join(import.meta.dirname, "../evals/selection/semantic/holdout-v2.2-boundary/holdout-freeze-manifest.json"),
				"utf8",
			),
		) as { evidencePackSha256: string; casesSha256: string };

		expect(() => validateHoldoutV22(cases, evidence)).not.toThrow();
		expect(evidence).toHaveLength(12);
		expect(cases).toHaveLength(12);
		expect(cases.filter((item) => item.boundaryType === "ANSWERABLE_NON_UNIQUENESS")).toHaveLength(4);
		expect(cases.filter((item) => item.boundaryType === "TRUE_INSUFFICIENCY")).toHaveLength(8);
		expect(evidence.every((entry) => entry.allowedForHoldoutOnly && !entry.runtimeAdmission)).toBe(true);
		expect(evidencePackHashV22()).toBe(manifest.evidencePackSha256);
		expect(holdoutCasesHashV22()).toBe(manifest.casesSha256);
		expect(FUTURE_GATE_V22.futureTotalCalls).toBe(24);
	});

	it("has a deterministic reversed order while keeping every proposition at two candidate uses or fewer", () => {
		const cases = loadHoldoutV22();
		for (const item of cases) {
			const reversed = reverseHoldoutCaseV22(item);
			expect(reversed.candidateEvidenceIds).not.toEqual(item.candidateEvidenceIds);
			expect(new Set(reversed.candidateEvidenceIds)).toEqual(new Set(item.candidateEvidenceIds));
		}
	});
});
