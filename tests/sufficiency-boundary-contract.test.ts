import { describe, expect, it } from "vitest";
import {
	SUFFICIENCY_BOUNDARY_CONTRACT_FIXTURES,
	validateSufficiencyBoundaryContractFixture,
} from "../evals/selection/semantic/holdout-v2.2-boundary/contract.ts";

describe("sufficiency-boundary semantic contract", () => {
	it("selects evidence that directly disproves a unique mandatory option", () => {
		const fixture = SUFFICIENCY_BOUNDARY_CONTRACT_FIXTURES[0]!;
		expect(() => validateSufficiencyBoundaryContractFixture(fixture)).not.toThrow();
		expect(fixture.expectedSelection).toBe("SELECT");
		expect(fixture.evidence).toBe("A 或 B 都可以。");
	});

	it("abstains when relevant evidence omits the exact requested duration", () => {
		const fixture = SUFFICIENCY_BOUNDARY_CONTRACT_FIXTURES[1]!;
		expect(() => validateSufficiencyBoundaryContractFixture(fixture)).not.toThrow();
		expect(fixture.expectedSelection).toBe("ABSTAIN");
		expect(fixture.evidence).toBe("应及时完成。");
	});
});
