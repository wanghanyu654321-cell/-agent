import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadPublicBenchmarkEntries, publicBenchmarkCases } from "../../../retrieval/public-benchmark.ts";
import { loadHoldoutEvidenceV22, loadHoldoutV22 } from "../holdout-v2.2-boundary/holdout.ts";

export const LATENCY_V231_INPUTS_PATH = join(import.meta.dirname, "inputs.json");

type HistoricalPopulationSource = "RECOVERY_2" | "V2_2_BOUNDARY";

type LatencyInputSpecV231 = {
	latencyInputId: string;
	historicalPopulationSource: HistoricalPopulationSource;
	historicalSourceCaseId: string;
	query: string;
	candidateEvidenceIds: string[];
	historicalExpectedSelection: string | "ABSTAIN";
	priorExposureEvidence: string;
};

export type LatencyInputV231 = LatencyInputSpecV231 & {
	candidates: Array<{ id: string; title: string; content: string }>;
	modelInputBytes: number;
};

function readSpecs(): LatencyInputSpecV231[] {
	return JSON.parse(readFileSync(LATENCY_V231_INPUTS_PATH, "utf8")) as LatencyInputSpecV231[];
}

function rawPopulationHash(): string {
	return createHash("sha256").update(readFileSync(LATENCY_V231_INPUTS_PATH)).digest("hex");
}

function priorTraceMatches(spec: LatencyInputSpecV231): boolean {
	const reportPath = join(import.meta.dirname, "..", "reports", spec.priorExposureEvidence);
	const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
		traces?: Array<{ caseId: string; order: string; candidates: Array<{ evidenceId: string }> }>;
	};
	return Boolean(
		report.traces?.some(
			(trace) =>
				trace.caseId === spec.historicalSourceCaseId &&
				trace.order === "primary" &&
				trace.candidates.map((candidate) => candidate.evidenceId).join("\u0000") ===
					spec.candidateEvidenceIds.join("\u0000"),
		),
	);
}

function resolveRecoveryInput(spec: LatencyInputSpecV231): LatencyInputV231 {
	const historicalCase = publicBenchmarkCases.find((item) => item.caseId === spec.historicalSourceCaseId);
	const entries = new Map(loadPublicBenchmarkEntries().map((entry) => [entry.id, entry]));
	if (!historicalCase || historicalCase.query !== spec.query || !priorTraceMatches(spec))
		throw new Error(`Recovery-2 input is not proven already exposed: ${spec.latencyInputId}`);
	const candidates = spec.candidateEvidenceIds.map((id) => {
		const entry = entries.get(id);
		if (!entry) throw new Error(`Recovery-2 input has missing evidence: ${id}`);
		return { id: entry.id, title: entry.title, content: entry.content };
	});
	return { ...spec, candidates, modelInputBytes: serializedModelInputBytes(spec.query, candidates) };
}

function resolveV22Input(spec: LatencyInputSpecV231): LatencyInputV231 {
	const historicalCase = loadHoldoutV22().find((item) => item.caseId === spec.historicalSourceCaseId);
	const evidence = new Map(loadHoldoutEvidenceV22().map((entry) => [entry.evidenceId, entry]));
	if (!historicalCase || historicalCase.query !== spec.query || !priorTraceMatches(spec))
		throw new Error(`V2.2 input is not proven already exposed: ${spec.latencyInputId}`);
	const candidates = spec.candidateEvidenceIds.map((id) => {
		const entry = evidence.get(id);
		if (!entry) throw new Error(`V2.2 input has missing evidence: ${id}`);
		return { id: entry.evidenceId, title: entry.title, content: entry.content };
	});
	return { ...spec, candidates, modelInputBytes: serializedModelInputBytes(spec.query, candidates) };
}

export function serializedModelInputBytes(
	query: string,
	candidates: Array<{ id: string; title: string; content: string }>,
): number {
	return Buffer.byteLength(
		JSON.stringify({
			query,
			candidates: candidates.map((candidate, index) => ({
				label: ["A", "B", "C"][index],
				title: candidate.title,
				content: candidate.content,
			})),
		}),
		"utf8",
	);
}

export function buildLatencyPopulationV231(): { inputs: LatencyInputV231[]; populationHash: string } {
	const specs = readSpecs();
	if (specs.length !== 10 || new Set(specs.map((item) => item.latencyInputId)).size !== 10)
		throw new Error("V2.3.1 latency characterization requires exactly 10 unique inputs.");
	if (new Set(specs.map((item) => item.historicalSourceCaseId)).size !== 10)
		throw new Error("V2.3.1 latency inputs must use distinct historical case IDs.");
	const inputs = specs.map((spec) =>
		spec.historicalPopulationSource === "RECOVERY_2" ? resolveRecoveryInput(spec) : resolveV22Input(spec),
	);
	if (
		inputs.some(
			(input) =>
				(input.candidates.length !== 2 && input.candidates.length !== 3) ||
				input.modelInputBytes <= 0 ||
				input.priorExposureEvidence.trim().length === 0,
		)
	)
		throw new Error("V2.3.1 latency input shape is invalid.");
	return { inputs, populationHash: rawPopulationHash() };
}
