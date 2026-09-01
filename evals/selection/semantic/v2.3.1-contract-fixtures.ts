export type V231ContractFixtureKind =
	| "DIRECT_VALUE"
	| "EXPLICIT_ABSENCE"
	| "MERE_SILENCE"
	| "NON_UNIQUE"
	| "RELATED_ONLY";

export type V231ContractFixture = {
	kind: V231ContractFixtureKind;
	query: string;
	evidence: string;
	expectedSelection: "SELECT" | "ABSTAIN";
	candidateDirectlySupportsTruthfulAnswer: boolean;
	explicitlyEstablishesAbsence: boolean;
};

/** Offline authoring fixtures; they are not a model evaluation population or production knowledge. */
export const V231_CONTRACT_FIXTURES: readonly V231ContractFixture[] = [
	{
		kind: "DIRECT_VALUE",
		query: "多少天？",
		evidence: "规则规定 3 天。",
		expectedSelection: "SELECT",
		candidateDirectlySupportsTruthfulAnswer: true,
		explicitlyEstablishesAbsence: false,
	},
	{
		kind: "EXPLICIT_ABSENCE",
		query: "固定是多少天？",
		evidence: "规则明确说明不设固定天数。",
		expectedSelection: "SELECT",
		candidateDirectlySupportsTruthfulAnswer: true,
		explicitlyEstablishesAbsence: true,
	},
	{
		kind: "MERE_SILENCE",
		query: "固定是多少天？",
		evidence: "规则要求及时完成。",
		expectedSelection: "ABSTAIN",
		candidateDirectlySupportsTruthfulAnswer: false,
		explicitlyEstablishesAbsence: false,
	},
	{
		kind: "NON_UNIQUE",
		query: "只能用一种方式吗？",
		evidence: "可使用 A 或 B。",
		expectedSelection: "SELECT",
		candidateDirectlySupportsTruthfulAnswer: true,
		explicitlyEstablishesAbsence: false,
	},
	{
		kind: "RELATED_ONLY",
		query: "退款多久到账？",
		evidence: "符合条件可以退款。",
		expectedSelection: "ABSTAIN",
		candidateDirectlySupportsTruthfulAnswer: false,
		explicitlyEstablishesAbsence: false,
	},
];

export function validateV231ContractFixtures(fixtures: readonly V231ContractFixture[]): void {
	if (fixtures.length !== 5) throw new Error("V2.3.1 requires exactly five semantic-contract fixtures.");
	if (new Set(fixtures.map((fixture) => fixture.kind)).size !== fixtures.length)
		throw new Error("V2.3.1 semantic-contract fixture kinds must be unique.");
	for (const fixture of fixtures) {
		if (!fixture.query.trim() || !fixture.evidence.trim()) throw new Error(`Incomplete fixture: ${fixture.kind}`);
		if (fixture.expectedSelection === "SELECT" && !fixture.candidateDirectlySupportsTruthfulAnswer)
			throw new Error(`SELECT fixture is not directly sufficient: ${fixture.kind}`);
		if (fixture.expectedSelection === "ABSTAIN" && fixture.candidateDirectlySupportsTruthfulAnswer)
			throw new Error(`ABSTAIN fixture is directly sufficient: ${fixture.kind}`);
		if (fixture.kind === "EXPLICIT_ABSENCE" && !fixture.explicitlyEstablishesAbsence)
			throw new Error("Explicit-absence fixture must establish the absence in candidate text.");
		if (fixture.kind === "MERE_SILENCE" && fixture.explicitlyEstablishesAbsence)
			throw new Error("Mere-silence fixture cannot establish absence.");
	}
}
