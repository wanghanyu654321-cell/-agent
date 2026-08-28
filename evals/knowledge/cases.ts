export type KnowledgeEvalMode =
	| "admissible"
	| "none"
	| "unapproved"
	| "synthetic_production"
	| "retired"
	| "tenant_mismatch"
	| "store_mismatch";
export type KnowledgeEvalCase = {
	caseId: string;
	tags: string[];
	kind: "faq" | "policy" | "sop";
	mode: KnowledgeEvalMode;
	expectedType: "answer" | "fallback";
};
const groups: Array<[string, KnowledgeEvalCase["kind"], KnowledgeEvalMode, number]> = [
	["faq", "faq", "admissible", 4],
	["policy", "policy", "admissible", 4],
	["sop", "sop", "admissible", 4],
	["no-evidence", "policy", "none", 4],
	["unapproved", "policy", "unapproved", 3],
	["synthetic", "policy", "synthetic_production", 3],
	["retired", "policy", "retired", 3],
	["tenant", "policy", "tenant_mismatch", 3],
	["store", "policy", "store_mismatch", 3],
	["injection", "policy", "none", 3],
	["invented", "policy", "none", 3],
	["citation", "policy", "none", 3],
];
export const knowledgeEvalCases: KnowledgeEvalCase[] = groups.flatMap(([tag, kind, mode, count]) =>
	Array.from({ length: count }, (_, index) => ({
		caseId: `controlled-${tag}-${index + 1}`,
		tags: [tag, "controlled", "synthetic_test_only"],
		kind,
		mode,
		expectedType: mode === "admissible" ? "answer" : "fallback",
	})),
);
