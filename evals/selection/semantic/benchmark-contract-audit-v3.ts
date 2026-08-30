import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildBenchmarkContractAuditV2 } from "./benchmark-contract-audit-v2.ts";

const v3Reasons: Record<string, string> = {
	"public-38":
		"Query states inability to provide service after arrival; evidence explicitly classifies inability after reservation as non-reception.",
	"public-39":
		"Query states refusal after successful reservation; evidence explicitly classifies refusal after reservation as non-reception.",
};

export function buildBenchmarkContractAuditV3() {
	const v2 = buildBenchmarkContractAuditV2();
	const cases = v2.cases.map((entry) =>
		v3Reasons[entry.caseId]
			? {
					...entry,
					directness: "direct",
					sufficiency: "sufficient",
					contractClassification: "SUPPORTED",
					requiredUnsupportedInference: false,
					reason: v3Reasons[entry.caseId],
				}
			: entry,
	);
	return {
		kind: "V2_3_BENCHMARK_CONTRACT_AUDIT_V3",
		cases,
		summary: Object.fromEntries(
			["SUPPORTED", "PARTIAL", "UNSUPPORTED"].map((key) => [
				key,
				cases.filter((entry) => entry.contractClassification === key).length,
			]),
		),
	};
}

export function joinRecovery2Diagnostics(audit = buildBenchmarkContractAuditV3()) {
	const report = JSON.parse(
		readFileSync(join(import.meta.dirname, "reports", "oauth-aware-semantic-gate-recovery-2-run.json"), "utf8"),
	) as { traces: Array<{ caseId: string; outcome: string; classification: string }> };
	const classifications = new Map(audit.cases.map((entry) => [entry.caseId, entry.contractClassification]));
	const joined = report.traces.map((trace) => {
		const classification = classifications.get(trace.caseId);
		if (!classification) throw new Error(`Recovery-2 trace has no V3 classification: ${trace.caseId}`);
		return { ...trace, contractClassification: classification };
	});
	if (
		joined.length !== 44 ||
		new Set(joined.map((trace) => `${trace.caseId}|${trace.outcome}|${trace.classification}`)).size < 1
	)
		throw new Error("Recovery-2 trace join is incomplete.");
	const summarize = (items: typeof joined) => ({
		total: items.length,
		selected: items.filter((item) => item.outcome === "selected").length,
		abstain: items.filter((item) => item.outcome === "abstained").length,
		wrong: items.filter((item) => item.classification === "wrong").length,
		correct: items.filter((item) => item.classification === "correct").length,
	});
	return {
		joinedTotal: joined.length,
		supported: summarize(joined.filter((item) => item.contractClassification === "SUPPORTED")),
		partialOrUnsupported: summarize(joined.filter((item) => item.contractClassification !== "SUPPORTED")),
	};
}
