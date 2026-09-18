import { hashPopulation } from "../evals/job-ready-rag/freeze.ts";
import type { RunDeclaration, RunInputs } from "./contracts.ts";

/** Freeze a declaration BEFORE dispatch. Caller retains it as the evaluation reference. */
export function declareRun(runId: string, inputs: RunInputs): RunDeclaration {
	const { suite, config, corpus } = inputs;
	if (!suite.cases.length) throw new Error("empty_suite");
	const ids = suite.cases.map((item) => item.caseId);
	if (new Set(ids).size !== ids.length) throw new Error("duplicate_case");
	if (
		![runId, suite.suiteId, ...ids, config.provider, config.model].every((id) => typeof id === "string" && id.trim())
	) {
		throw new Error("invalid_identity");
	}
	if (![config.sourceCommit, config.sourceTree].every((id) => id === "unknown" || /^[a-f0-9]{40}$/.test(id))) {
		throw new Error("invalid_source_identity");
	}
	if (
		config.runtimeMode !== "deterministic" ||
		config.embeddingProfile !== null ||
		!["lexical", "fake"].includes(config.retrievalStrategy) ||
		config.toolExecution !== "sequential" ||
		config.limits.maxAgentTurns !== 4 ||
		config.limits.maxToolCalls !== 6 ||
		config.limits.overallTurnTimeoutMs !== 10000 ||
		config.limits.perToolTimeoutMs !== 2000
	) {
		throw new Error("unsupported_s1_config");
	}
	return {
		runId,
		suiteId: suite.suiteId,
		suiteHash: hashPopulation(suite),
		configHash: hashPopulation(config),
		corpusHash: corpus === null ? "unknown" : hashPopulation(corpus),
		config: structuredClone(config),
		expectedCaseIds: ids,
	};
}
