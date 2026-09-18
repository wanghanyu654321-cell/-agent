export type KnowledgeEvalMode =
	| "admissible"
	| "none"
	| "unapproved"
	| "synthetic_production"
	| "retired"
	| "tenant_mismatch"
	| "store_mismatch"
	| "faq_authorized_after_unauthorized";
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
	["faq-unapproved", "faq", "unapproved", 1],
	["faq-synthetic", "faq", "synthetic_production", 1],
	["faq-retired", "faq", "retired", 1],
	["faq-tenant", "faq", "tenant_mismatch", 1],
	["faq-store", "faq", "store_mismatch", 1],
	["faq-candidate-selection", "faq", "faq_authorized_after_unauthorized", 1],
];
export const knowledgeEvalCases: KnowledgeEvalCase[] = groups.flatMap(([tag, kind, mode, count]) =>
	Array.from({ length: count }, (_, index) => ({
		caseId: `controlled-${tag}-${index + 1}`,
		tags: [tag, "controlled", "synthetic_test_only"],
		kind,
		mode,
		expectedType: mode === "admissible" || mode === "faq_authorized_after_unauthorized" ? "answer" : "fallback",
	})),
);
