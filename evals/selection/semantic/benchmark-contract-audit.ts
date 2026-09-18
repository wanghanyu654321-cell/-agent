import { loadPublicBenchmarkEntries, publicBenchmarkCases } from "../../retrieval/public-benchmark.ts";

export type BenchmarkContractClassification = "SUPPORTED" | "PARTIAL" | "UNSUPPORTED";

export interface BenchmarkContractAuditCase {
	caseId: string;
	query: string;
	expectedEvidenceId: string;
	category: string;
	queryProvenance: string;
	difficulty: string;
	directness: "direct" | "indirect" | "not_direct";
	sufficiency: "sufficient" | "partial" | "insufficient";
	contractClassification: BenchmarkContractClassification;
	reason: string;
	requiredUnsupportedInference: boolean;
	auditEvidence: { id: string; title: string; version: string; sourceRef: string };
}

const partialReasons: Record<string, string> = {
	"public-04": "Evidence states the consequence after expiry; query asks where or how to check validity.",
	"public-23":
		"Evidence says third-party account issues may be handled separately; query asks what the user should do.",
	"public-26": "Evidence defers the refund method to the order page; query asks how to apply.",
	"public-28": "Evidence states refund arrival after approval; query asks approval-processing duration.",
	"public-29": "Evidence defers the refund method to the order page; query asks how to apply.",
	"public-41": "Evidence identifies an unserved-arrival scenario but supplies no user remedy for the question.",
	"public-42": "Evidence describes merchant notice duties, not whether this voucher remains usable now.",
	"public-43": "Evidence identifies a merchant notice failure but does not answer the customer's next action.",
	"public-44": "Evidence identifies an unserved-arrival scenario but supplies no user remedy for the question.",
};

/** Frozen human/code audit: classifications are defined before Recovery-2 traces are consulted. */
export function buildBenchmarkContractAudit(): {
	rubric: Record<BenchmarkContractClassification, string>;
	cases: BenchmarkContractAuditCase[];
	summary: { supported: number; partial: number; unsupported: number };
} {
	const entries = new Map(loadPublicBenchmarkEntries().map((entry) => [entry.id, entry]));
	const cases: BenchmarkContractAuditCase[] = publicBenchmarkCases
		.filter((testCase) => testCase.expectedAnswerable)
		.map((testCase) => {
			const expectedEvidenceId = testCase.expectedEvidenceIds[0]!;
			const evidence = entries.get(expectedEvidenceId);
			if (!evidence) throw new Error(`Missing audit evidence for ${testCase.caseId}.`);
			const reason = partialReasons[testCase.caseId];
			return {
				caseId: testCase.caseId,
				query: testCase.query,
				expectedEvidenceId,
				category: testCase.category,
				queryProvenance: testCase.queryProvenance,
				difficulty: testCase.difficulty,
				directness: reason ? "indirect" : "direct",
				sufficiency: reason ? "partial" : "sufficient",
				contractClassification: reason ? "PARTIAL" : "SUPPORTED",
				reason:
					reason ??
					"Evidence states the policy or fact needed to answer the query without a new business-policy fact.",
				requiredUnsupportedInference: Boolean(reason),
				auditEvidence: {
					id: evidence.id,
					title: evidence.title,
					version: evidence.version,
					sourceRef: evidence.sourceRef,
				},
			} satisfies BenchmarkContractAuditCase;
		});
	const summary = {
		supported: cases.filter((entry) => entry.contractClassification === "SUPPORTED").length,
		partial: cases.filter((entry) => entry.contractClassification === "PARTIAL").length,
		unsupported: cases.filter((entry) => entry.contractClassification === "UNSUPPORTED").length,
	};
	return {
		rubric: {
			SUPPORTED:
				"Evidence contains the policy or fact needed to answer the query without a new business-policy fact.",
			PARTIAL: "Evidence addresses the workflow but misses a material component requested by the query.",
			UNSUPPORTED: "The requested fact or action cannot be grounded in this evidence.",
		},
		cases,
		summary,
	};
}
