import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	evidencePackHashV231Final,
	FINAL_UNSEEN_GATE_V231,
	holdoutCasesHashV231Final,
	loadHoldoutEvidenceV231Final,
	loadHoldoutV231Final,
	reverseHoldoutCaseV231Final,
	validateHoldoutV231Final,
} from "../evals/selection/semantic/holdout-v2.3.1-final/holdout.ts";
import { SEMANTIC_SELECTOR_PROMPT_VERSION, SEMANTIC_SELECTOR_SYSTEM_PROMPT } from "../src/semantic-selector.ts";

describe("final fresh V2.3.1 unseen semantic holdout", () => {
	it("pins exactly twelve isolated cases, their bytes, and the immutable 24-call Gate", () => {
		const evidence = loadHoldoutEvidenceV231Final();
		const cases = loadHoldoutV231Final();
		const manifest = JSON.parse(
			readFileSync(
				join(import.meta.dirname, "../evals/selection/semantic/holdout-v2.3.1-final/holdout-freeze-manifest.json"),
				"utf8",
			),
		) as {
			evidencePackSha256: string;
			casesSha256: string;
			promptVersion: string;
			promptSha256: string;
		};

		expect(() => validateHoldoutV231Final(cases, evidence)).not.toThrow();
		expect(evidence).toHaveLength(12);
		expect(cases).toHaveLength(12);
		expect(cases.filter((item) => item.boundaryType === "CLEAR_DIRECT_ANSWER")).toHaveLength(4);
		expect(cases.filter((item) => item.boundaryType === "TRUE_INSUFFICIENCY")).toHaveLength(4);
		expect(cases.filter((item) => item.boundaryType === "HARD_RELATED_INSUFFICIENT")).toHaveLength(4);
		expect(evidence.every((entry) => entry.allowedForHoldoutOnly && !entry.runtimeAdmission)).toBe(true);
		expect(evidencePackHashV231Final()).toBe(manifest.evidencePackSha256);
		expect(holdoutCasesHashV231Final()).toBe(manifest.casesSha256);
		expect(manifest.promptVersion).toBe(SEMANTIC_SELECTOR_PROMPT_VERSION);
		expect(manifest.promptSha256).toBe(createHash("sha256").update(SEMANTIC_SELECTOR_SYSTEM_PROMPT).digest("hex"));
		expect(manifest.promptSha256).toBe("fabf617ce6ecd9cc4f91cd68e42c789f1c0be629297e046a3c782fe6bfe29869");
		expect(FINAL_UNSEEN_GATE_V231).toMatchObject({
			futurePrimaryCalls: 12,
			futureReversedCalls: 12,
			futureTotalCalls: 24,
			wrong: 0,
			invalid: 0,
			providerError: 0,
			timeout: 0,
			orderInducedWrong: 0,
			orderInducedOutcomeDisagreement: 0,
		});
	});

	it("keeps candidates evaluation-only, structurally novel, and free of evaluator-authored absence claims", () => {
		const evidence = loadHoldoutEvidenceV231Final();
		const cases = loadHoldoutV231Final();
		for (const item of cases) {
			const reversed = reverseHoldoutCaseV231Final(item);
			expect(reversed.candidateEvidenceIds).not.toEqual(item.candidateEvidenceIds);
			expect(new Set(reversed.candidateEvidenceIds)).toEqual(new Set(item.candidateEvidenceIds));
			expect(item.noveltyVerdict).toBe("NEW");
			expect(item.candidateEvidenceIds.length).toBeGreaterThanOrEqual(2);
			expect(item.candidateEvidenceIds.length).toBeLessThanOrEqual(3);
		}
		for (const entry of evidence) {
			expect(entry.content).not.toMatch(/(?:规则)?(?:没有|未)(?:说明|给出|规定|披露)/);
			expect(entry.content).not.toMatch(/(?:具体|固定|统一)(?:天数|数值|金额|公式)/);
		}
	});

	it("does not expose the final holdout to product runtime entry points", () => {
		for (const runtimeFile of ["../src/index.ts", "../src/knowledge.ts", "../src/private-corpus.ts"]) {
			expect(readFileSync(join(import.meta.dirname, runtimeFile), "utf8")).not.toContain("holdout-v2.3.1-final");
		}
	});
});
