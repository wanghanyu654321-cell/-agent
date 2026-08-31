export type SufficiencyBoundaryFixture = {
	query: string;
	evidence: string;
	expectedSelection: "SELECT" | "ABSTAIN";
	evidenceDirectlyAnswersQuestion: boolean;
	requiresUnsupportedInference: boolean;
};

/**
 * This is an authoring contract, not a semantic selector. It locks the precise
 * distinction that V2.2 evaluates before any provider is exposed to the data.
 */
export const SUFFICIENCY_BOUNDARY_CONTRACT_FIXTURES: readonly SufficiencyBoundaryFixture[] = [
	{
		query: "必须只有一种方案吗？",
		evidence: "A 或 B 都可以。",
		expectedSelection: "SELECT",
		evidenceDirectlyAnswersQuestion: true,
		requiresUnsupportedInference: false,
	},
	{
		query: "必须在多少天内完成？",
		evidence: "应及时完成。",
		expectedSelection: "ABSTAIN",
		evidenceDirectlyAnswersQuestion: false,
		requiresUnsupportedInference: true,
	},
];

export function validateSufficiencyBoundaryContractFixture(fixture: SufficiencyBoundaryFixture): void {
	if (!fixture.query.trim() || !fixture.evidence.trim())
		throw new Error("Boundary fixture must contain query and evidence.");
	if (fixture.expectedSelection === "SELECT") {
		if (!fixture.evidenceDirectlyAnswersQuestion || fixture.requiresUnsupportedInference)
			throw new Error("SELECT fixture must be direct and self-sufficient.");
		return;
	}
	if (fixture.evidenceDirectlyAnswersQuestion || !fixture.requiresUnsupportedInference)
		throw new Error("ABSTAIN fixture must omit the requested fact.");
}
