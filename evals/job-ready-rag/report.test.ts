import { describe, expect, it } from "vitest";
import { jobReadyRetrievalCases } from "./cases.ts";
import { freezePopulation } from "./freeze.ts";
import { buildReport, renderReportJson, renderReportMarkdown, verifyMeasurementBinding } from "./report.ts";
import type { RetrievalEvalCase, RetrievalMeasurement } from "./schema.ts";

const frozen = freezePopulation();

function measure(caseId: string, overrides: Partial<RetrievalMeasurement> = {}): RetrievalMeasurement {
	return {
		caseId,
		sourceCommit: "test-commit",
		casesSha256: frozen.casesSha256,
		corpusSha256: frozen.corpusSha256,
		mode: "lexical",
		returnedEvidenceIds: [],
		admittedEvidenceIds: [],
		returnedVersions: {},
		actualAnswerability: "no_answer",
		elapsedMs: 10,
		pass: true,
		failureReasons: [],
		...overrides,
	};
}

function correctMeasurement(evalCase: RetrievalEvalCase): RetrievalMeasurement {
	if (evalCase.expectedAnswerability === "no_answer")
		return measure(evalCase.caseId, { actualAnswerability: "no_answer" });
	const returnedVersions: Record<string, string> = {};
	for (const id of evalCase.expectedEvidenceIds) returnedVersions[id] = evalCase.expectedVersions[id];
	return measure(evalCase.caseId, {
		returnedEvidenceIds: [...evalCase.expectedEvidenceIds],
		admittedEvidenceIds: [...evalCase.expectedEvidenceIds],
		returnedVersions,
		actualAnswerability: evalCase.expectedAnswerability === "ambiguous" ? "ambiguous" : "answerable",
	});
}

const correctRun = jobReadyRetrievalCases.map(correctMeasurement);

describe("measurement binding", () => {
	it("accepts measurements carrying the frozen population hashes", () => {
		const binding = verifyMeasurementBinding(correctRun, frozen);
		expect(binding.ok).toBe(true);
		expect(binding.mismatchedCaseIds).toEqual([]);
		expect(binding.observedCasesSha256).toEqual([frozen.casesSha256]);
	});

	it("rejects measurements bound to a different population", () => {
		const drifted = [measure("JR-RAG-ANS-01", { casesSha256: "f".repeat(64) })];
		const binding = verifyMeasurementBinding(drifted, frozen);
		expect(binding.ok).toBe(false);
		expect(binding.mismatchedCaseIds).toEqual(["JR-RAG-ANS-01"]);
	});
});

describe("report assembly", () => {
	it("never asserts an overall PASS and keeps GAP-05 unresolved", () => {
		const report = buildReport(correctRun);
		expect(report.overallPassLabel).toBeNull();
		expect(report.gap05.status).toBe("unresolved");
		expect(report.binding.ok).toBe(true);
		expect(report.safetyInvariantsHold).toBe(true);
		expect(report.frozenPopulation.casesSha256).toBe(frozen.casesSha256);
	});

	it("surfaces violations and failed case ids when a run is unhealthy", () => {
		const unhealthy = correctRun.map((item) => ({ ...item }));
		const target = unhealthy.findIndex((item) => item.caseId === "JR-RAG-NOANS-05");
		unhealthy[target] = measure("JR-RAG-NOANS-05", {
			returnedEvidenceIds: ["JR-FIX-UNAPPROVED-DRAFT"],
			admittedEvidenceIds: ["JR-FIX-UNAPPROVED-DRAFT"],
			returnedVersions: { "JR-FIX-UNAPPROVED-DRAFT": "jr-fixture-v1" },
			actualAnswerability: "answerable",
		});
		const report = buildReport(unhealthy);
		expect(report.safetyInvariantsHold).toBe(false);
		expect(report.metrics.safetyInvariants.unapprovedAdmissions).toBe(1);
		expect(report.metrics.failedCaseIds).toContain("JR-RAG-NOANS-05");
	});
});

describe("private-data-free rendering", () => {
	it("renders markdown with the GAP-05 banner, invariants and failed ids", () => {
		const markdown = renderReportMarkdown(buildReport(correctRun));
		expect(markdown).toContain("CONTRACT GAP-05");
		expect(markdown).toContain("not asserted");
		expect(markdown).toContain("HOLD");
		expect(markdown).toContain(frozen.casesSha256);
		expect(markdown).toContain("Recall@3");
		expect(markdown).toContain("Wrong Evidence Rate");
		expect(markdown).toContain("No-answer Accuracy");
	});

	it("renders violation state when invariants break", () => {
		const unhealthy = correctRun.map((item) => ({ ...item }));
		unhealthy[0] = measure("JR-RAG-ANS-01", {
			returnedEvidenceIds: ["PB-MT-VOUCHER-USE"],
			admittedEvidenceIds: ["PB-MT-VOUCHER-USE"],
			returnedVersions: { "PB-MT-VOUCHER-USE": "wrong" },
			actualAnswerability: "answerable",
		});
		const markdown = renderReportMarkdown(buildReport(unhealthy));
		expect(markdown).toContain("VIOLATED");
		expect(markdown).toContain("JR-RAG-ANS-01");
	});

	it("never leaks corpus prose, query text or fixture content", () => {
		const markdown = renderReportMarkdown(buildReport(correctRun));
		const json = renderReportJson(buildReport(correctRun));
		for (const secret of ["公开基准事实", "合成隔离测试夹具", "团购券过了约定有效期", "AliceDemo"]) {
			expect(markdown).not.toContain(secret);
			expect(json).not.toContain(secret);
		}
	});

	it("produces parseable canonical JSON", () => {
		const json = renderReportJson(buildReport(correctRun));
		const parsed = JSON.parse(json) as { schema: string; overallPassLabel: null };
		expect(parsed.schema).toBe("job-ready-rag/retrieval-eval-report@1");
		expect(parsed.overallPassLabel).toBeNull();
	});
});
