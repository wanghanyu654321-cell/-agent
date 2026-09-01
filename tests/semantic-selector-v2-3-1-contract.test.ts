import { describe, expect, it } from "vitest";
import {
	V231_CONTRACT_FIXTURES,
	validateV231ContractFixtures,
} from "../evals/selection/semantic/v2.3.1-contract-fixtures.ts";
import { SEMANTIC_SELECTOR_PROMPT_VERSION, SEMANTIC_SELECTOR_SYSTEM_PROMPT } from "../src/semantic-selector.ts";

describe("V2.3.1 semantic selector contract", () => {
	it("requires direct truthful support, explicit absence, and label-order independence", () => {
		expect(SEMANTIC_SELECTOR_PROMPT_VERSION).toBe("v2.3.1");
		expect(SEMANTIC_SELECTOR_SYSTEM_PROMPT).toContain("Do not infer an absence merely from silence.");
		expect(SEMANTIC_SELECTOR_SYSTEM_PROMPT).toContain("independently based on their content");
		expect(SEMANTIC_SELECTOR_SYSTEM_PROMPT).toContain("Candidate labels and ordering are arbitrary");
		expect(SEMANTIC_SELECTOR_SYSTEM_PROMPT).toContain("Topical relevance alone is insufficient.");
	});

	it("keeps value, explicit-absence, silence, non-unique, and related-only boundaries distinct", () => {
		expect(() => validateV231ContractFixtures(V231_CONTRACT_FIXTURES)).not.toThrow();
		expect(V231_CONTRACT_FIXTURES.map((fixture) => [fixture.kind, fixture.expectedSelection])).toEqual([
			["DIRECT_VALUE", "SELECT"],
			["EXPLICIT_ABSENCE", "SELECT"],
			["MERE_SILENCE", "ABSTAIN"],
			["NON_UNIQUE", "SELECT"],
			["RELATED_ONLY", "ABSTAIN"],
		]);
	});
});
