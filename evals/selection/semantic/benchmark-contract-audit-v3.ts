import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildBenchmarkContractAuditV2 } from "./benchmark-contract-audit-v2.ts";

const v3Reasons: Record<string, string> = {
	"public-38":
		"Query states inability to provide service after arrival; evidence explicitly classifies inability after reservation as non-reception.",
	"public-39":
		"Query states refusal after successful reservation; evidence explicitly classifies refusal after reservation as non-reception.",
};

export interface Recovery2Trace {
	caseId: string;
	order: "primary" | "reversed";
	outcome: string;
	classification: string;
}

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

export function loadRecovery2Traces(): Recovery2Trace[] {
	return (
		JSON.parse(
			readFileSync(join(import.meta.dirname, "reports", "oauth-aware-semantic-gate-recovery-2-run.json"), "utf8"),
		) as { traces: Recovery2Trace[] }
	).traces;
}

export function joinRecovery2Traces(traces: Recovery2Trace[], audit = buildBenchmarkContractAuditV3()) {
	const classifications = new Map(audit.cases.map((entry) => [entry.caseId, entry.contractClassification]));
	if (traces.length !== 44) throw new Error("Recovery-2 trace count must equal 44.");

	const seen = new Set<string>();
	const ordersByCase = new Map<string, Set<string>>();
	const joined = traces.map((trace) => {
		if (trace.order !== "primary" && trace.order !== "reversed") {
			throw new Error(`Recovery-2 trace has invalid order: ${trace.order}`);
		}
		const classification = classifications.get(trace.caseId);
		if (!classification) throw new Error(`Recovery-2 trace has no V3 classification: ${trace.caseId}`);
		const identity = `${trace.caseId}\u0000${trace.order}`;
		if (seen.has(identity)) throw new Error(`Recovery-2 duplicate trace identity: ${trace.caseId}/${trace.order}`);
		seen.add(identity);
		const orders = ordersByCase.get(trace.caseId) ?? new Set<string>();
		orders.add(trace.order);
		ordersByCase.set(trace.caseId, orders);
		return { ...trace, contractClassification: classification };
	});
	if (seen.size !== 44 || ordersByCase.size !== 22) throw new Error("Recovery-2 trace join is incomplete.");
	for (const [caseId, orders] of ordersByCase) {
		if (orders.size !== 2 || !orders.has("primary") || !orders.has("reversed")) {
			throw new Error(`Recovery-2 trace pair is incomplete: ${caseId}`);
		}
	}
	return joined;
}

export function joinRecovery2Diagnostics(audit = buildBenchmarkContractAuditV3()) {
	const joined = joinRecovery2Traces(loadRecovery2Traces(), audit);
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
