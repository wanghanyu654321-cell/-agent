import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPublicBenchmarkEntries } from "../evals/retrieval/public-benchmark.ts";
import {
	evidencePackHashV21,
	FUTURE_GATE_V21,
	holdoutCasesHashV21,
	loadHoldoutEvidenceV21,
	loadHoldoutV21,
	reverseHoldoutCaseV21,
	validateHoldoutV21,
} from "../evals/selection/semantic/holdout-v2.1/holdout.ts";

describe("truly unseen semantic holdout v2.1", () => {
	it("pins independently stored, holdout-only inputs and the exact future Gate", () => {
		const evidence = loadHoldoutEvidenceV21();
		const cases = loadHoldoutV21();
		const manifest = JSON.parse(
			readFileSync(
				join(import.meta.dirname, "../evals/selection/semantic/holdout-v2.1/holdout-freeze-manifest.json"),
				"utf8",
			),
		) as { evidencePackSha256: string; casesSha256: string };

		expect(() => validateHoldoutV21(cases, evidence)).not.toThrow();
		expect(evidence).toHaveLength(14);
		expect(cases).toHaveLength(24);
		expect(cases.filter((item) => item.expectedSelection !== "ABSTAIN")).toHaveLength(18);
		expect(cases.filter((item) => item.expectedSelection === "ABSTAIN")).toHaveLength(6);
		expect(cases.every((item) => item.noveltyVerdict === "NEW")).toBe(true);
		expect(evidencePackHashV21()).toBe(manifest.evidencePackSha256);
		expect(holdoutCasesHashV21()).toBe(manifest.casesSha256);
		expect(FUTURE_GATE_V21.futureTotalCalls).toBe(48);
	});

	it("repairs the three pre-run contract-quality defects without exposing holdout evidence to runtime", () => {
		const cases = loadHoldoutV21();
		const case02 = cases.find((item) => item.caseId === "holdout-v2.1-02");
		const case12 = cases.find((item) => item.caseId === "holdout-v2.1-12");
		const case14 = cases.find((item) => item.caseId === "holdout-v2.1-14");
		const case18 = cases.find((item) => item.caseId === "holdout-v2.1-18");

		expect(case02?.expectedSelection).toBe("HO2-MT-TRANSACTION-RESERVATION-CONTACT");
		expect(case12?.expectedSelection).toBe("HO21-MT-FULFILL-PREMATURE-VERIFICATION");
		expect(case14?.expectedSelection).toBe("HO21-MT-FULFILL-UNDISCLOSED-USAGE-LIMIT");
		expect(case18?.candidateEvidenceIds).toEqual([
			"HO2-MT-TRANSACTION-RESERVATION-CONTACT",
			"HO2-MT-APPT-ARRIVAL-PRIORITY",
		]);

		for (const item of cases) {
			const reversed = reverseHoldoutCaseV21(item);
			expect(reversed.candidateEvidenceIds).not.toEqual(item.candidateEvidenceIds);
			expect(new Set(reversed.candidateEvidenceIds)).toEqual(new Set(item.candidateEvidenceIds));
		}

		const productionEvidenceIds = new Set(loadPublicBenchmarkEntries().map((entry) => entry.id));
		for (const id of loadHoldoutEvidenceV21().map((entry) => entry.evidenceId)) {
			expect(productionEvidenceIds.has(id)).toBe(false);
		}
		for (const runtimeFile of ["../src/index.ts", "../src/knowledge.ts", "../src/private-corpus.ts"]) {
			expect(readFileSync(join(import.meta.dirname, runtimeFile), "utf8")).not.toContain("holdout-v2.1");
		}
	});
});
