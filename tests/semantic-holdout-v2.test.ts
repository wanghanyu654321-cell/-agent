import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPublicBenchmarkEntries } from "../evals/retrieval/public-benchmark.ts";
import {
	evidencePackHashV2,
	FUTURE_GATE_V2,
	holdoutCasesHashV2,
	loadHoldoutEvidenceV2,
	loadHoldoutV2,
	reverseHoldoutCaseV2,
	validateHoldoutV2,
} from "../evals/selection/semantic/holdout-v2/holdout.ts";

describe("truly unseen semantic holdout v2", () => {
	it("has explicit, independently stored semantic contracts and frozen byte hashes", () => {
		const evidence = loadHoldoutEvidenceV2();
		const cases = loadHoldoutV2();
		const manifest = JSON.parse(
			readFileSync(
				join(import.meta.dirname, "../evals/selection/semantic/holdout-v2/holdout-freeze-manifest.json"),
				"utf8",
			),
		) as { evidencePackSha256: string; casesSha256: string };

		expect(() => validateHoldoutV2(cases, evidence)).not.toThrow();
		expect(evidence).toHaveLength(12);
		expect(cases).toHaveLength(24);
		expect(cases.filter((item) => item.expectedSelection !== "ABSTAIN")).toHaveLength(18);
		expect(cases.filter((item) => item.expectedSelection === "ABSTAIN")).toHaveLength(6);
		expect(cases.every((item) => typeof item.goldDirectness === "string")).toBe(true);
		expect(cases.every((item) => typeof item.goldSufficiency === "string")).toBe(true);
		expect(cases.every((item) => typeof item.requiresUnsupportedInference === "boolean")).toBe(true);
		expect(cases.every((item) => item.noveltyVerdict === "NEW")).toBe(true);
		expect(evidencePackHashV2()).toBe(manifest.evidencePackSha256);
		expect(holdoutCasesHashV2()).toBe(manifest.casesSha256);
	});

	it("derives a stable 24-case reverse diagnostic without changing semantic identity", () => {
		for (const item of loadHoldoutV2()) {
			const reversed = reverseHoldoutCaseV2(item);
			expect(reversed.caseId).toBe(item.caseId);
			expect(reversed.query).toBe(item.query);
			expect(reversed.expectedSelection).toBe(item.expectedSelection);
			expect(new Set(reversed.candidateEvidenceIds)).toEqual(new Set(item.candidateEvidenceIds));
			expect(reversed.candidateEvidenceIds).not.toEqual(item.candidateEvidenceIds);
			expect(reversed.goldDirectness).toBe(item.goldDirectness);
		}
		expect(FUTURE_GATE_V2.futureTotalCalls).toBe(48);
	});

	it("keeps holdout-only evidence outside the public production knowledge loader", () => {
		const productionEvidenceIds = new Set(loadPublicBenchmarkEntries().map((entry) => entry.id));
		const holdoutEvidenceIds = loadHoldoutEvidenceV2().map((entry) => entry.evidenceId);
		expect(holdoutEvidenceIds.some((id) => productionEvidenceIds.has(id))).toBe(false);
		const publicLoader = readFileSync(join(import.meta.dirname, "../evals/retrieval/public-benchmark.ts"), "utf8");
		expect(publicLoader).not.toContain("holdout-v2");
		for (const runtimeFile of ["../src/index.ts", "../src/knowledge.ts", "../src/private-corpus.ts"]) {
			expect(readFileSync(join(import.meta.dirname, runtimeFile), "utf8")).not.toContain("holdout-v2");
		}
	});
});
