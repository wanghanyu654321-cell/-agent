import { describe, expect, it } from "vitest";
import * as publicBenchmarkModule from "../evals/retrieval/public-benchmark.ts";
import {
	loadPublicBenchmarkEntries,
	publicBenchmarkCases,
	runPublicBenchmarkEvaluation,
	runPublicBenchmarkRuntimeEvaluation,
} from "../evals/retrieval/public-benchmark.ts";
import { isRetrievalQualityGatePassed } from "../src/retrieval-eval.ts";

describe("V2.1 public real-world retrieval benchmark", () => {
	it("uses only governed public-official entries and all required query provenance roles", () => {
		const entries = loadPublicBenchmarkEntries();
		expect(entries.length).toBeGreaterThanOrEqual(10);
		expect(entries.every((entry) => entry.status === "approved")).toBe(true);
		expect(entries.every((entry) => entry.sourceRef.startsWith("https://"))).toBe(true);
		expect(publicBenchmarkCases.length).toBeGreaterThanOrEqual(60);
		expect(new Set(publicBenchmarkCases.map((testCase) => testCase.queryProvenance))).toEqual(
			new Set(["PUBLIC_REAL_CASE", "HUMAN_AUTHORED", "SYNTHETIC_QUERY"]),
		);
	});

	it("rejects a retrieval-quality gate with more than five percent wrong evidence", () => {
		expect(
			isRetrievalQualityGatePassed({
				top1HitRate: 1,
				recallAt3: 1,
				noAnswerCorrectRejectionRate: 1,
				wrongEvidenceRate: 0.06,
				evidencePrecision: 1,
				extraneousEvidenceRate: 0,
				meanReturnedEvidenceCount: 1,
				crossTenantLeakageRate: 0,
				crossStoreLeakageRate: 0,
				unauthorizedKnowledgeExposureRate: 0,
				queryProvenanceBreakdown: {},
				categoryBreakdown: {},
			}),
		).toBe(false);
	});

	it("measures the public corpus through real Pi tool events and persisted audit evidence", async () => {
		const retrieval = await runPublicBenchmarkEvaluation();
		const runtime = await runPublicBenchmarkRuntimeEvaluation();

		expect(retrieval.final.gatePassed).toBe(true);
		expect(runtime.gatePassed).toBe(true);
		expect(runtime.metrics.unsupportedBusinessFactRate).toBe(0);
		expect(runtime.metrics.evidenceTraceAccuracy).toBe(1);
		expect(runtime.metrics.evidenceVersionTraceAccuracy).toBe(1);
		expect(runtime.metrics.noEvidenceFailClosedRate).toBe(1);
		expect(runtime.results.every((result) => result.agentToolEvents.includes("search_knowledge"))).toBe(true);
		expect(runtime.results.every((result) => result.auditRead)).toBe(true);
	});

	it("measures evidence precision independently and preserves the two retrieval-ranking misses", async () => {
		const retrieval = await runPublicBenchmarkEvaluation();
		const answerable = retrieval.final.results.filter((result) => result.expectedAnswerable);
		const returnedEvidence = answerable.flatMap((result) => result.actualEvidenceIds);
		const goldEvidence = answerable.flatMap((result) =>
			result.actualEvidenceIds.filter((id) => result.expectedEvidenceIds.includes(id)),
		);
		const expectedPrecision = goldEvidence.length / returnedEvidence.length;

		expect(retrieval.final.metrics.evidencePrecision).toBeCloseTo(expectedPrecision);
		expect(retrieval.final.metrics.extraneousEvidenceRate).toBeCloseTo(1 - expectedPrecision);
		expect(retrieval.final.metrics.meanReturnedEvidenceCount).toBeCloseTo(
			returnedEvidence.length / answerable.length,
		);
		expect(retrieval.final.results.find((result) => result.caseId === "public-24")?.actualEvidenceIds).toEqual([
			"PB-MT-UNCONSUMED-REFUND",
			"PB-MT-AFTERSALES-CONTACT",
			"PB-MT-REFUND-ORIGINAL-PAYMENT",
		]);
		expect(retrieval.final.results.find((result) => result.caseId === "public-30")?.actualEvidenceIds).toEqual([
			"PB-MT-VOUCHER-USE",
			"PB-MT-UNCONSUMED-REFUND",
		]);
	});

	it("detects independent runtime metric negative controls", () => {
		const measure = (
			publicBenchmarkModule as unknown as {
				measurePublicRuntimeObservation?: (observation: unknown) => {
					unsupportedBusinessFact: boolean;
					evidenceTraceAccurate: boolean;
					evidenceVersionTraceAccurate: boolean;
					noEvidenceFailClosed: boolean;
				};
			}
		).measurePublicRuntimeObservation;
		expect(measure).toBeTypeOf("function");

		const entry = loadPublicBenchmarkEntries().find((candidate) => candidate.id === "PB-MT-VOUCHER-USE")!;
		const reference = { id: entry.id, version: entry.version, sourceRef: entry.sourceRef, kind: entry.kind };
		const answerableCase = publicBenchmarkCases[0];
		const noAnswerCase = publicBenchmarkCases.find((candidate) => !candidate.expectedAnswerable)!;

		expect(
			measure!({
				testCase: answerableCase,
				result: { type: "answer", text: entry.content, evidence: [reference] },
				auditEvidence: [reference],
				corpusEvidence: [{ reference, text: entry.content }],
			}),
		).toMatchObject({
			unsupportedBusinessFact: false,
			evidenceTraceAccurate: true,
			evidenceVersionTraceAccurate: true,
			noEvidenceFailClosed: true,
		});
		expect(
			measure!({
				testCase: answerableCase,
				result: { type: "answer", text: `${entry.content}\n退款会在两小时内完成。`, evidence: [reference] },
				auditEvidence: [reference],
				corpusEvidence: [{ reference, text: entry.content }],
			}),
		).toMatchObject({ unsupportedBusinessFact: true });
		expect(
			measure!({
				testCase: answerableCase,
				result: { type: "answer", text: entry.content, evidence: [reference] },
				auditEvidence: [],
				corpusEvidence: [{ reference, text: entry.content }],
			}),
		).toMatchObject({ evidenceTraceAccurate: false });
		expect(
			measure!({
				testCase: answerableCase,
				result: { type: "answer", text: entry.content, evidence: [{ ...reference, version: "wrong-version" }] },
				auditEvidence: [{ ...reference, version: "wrong-version" }],
				corpusEvidence: [{ reference, text: entry.content }],
			}),
		).toMatchObject({ evidenceVersionTraceAccurate: false });
		expect(
			measure!({
				testCase: answerableCase,
				result: {
					type: "answer",
					text: entry.content,
					evidence: [{ ...reference, sourceRef: "https://wrong.example" }],
				},
				auditEvidence: [{ ...reference, sourceRef: "https://wrong.example" }],
				corpusEvidence: [{ reference, text: entry.content }],
			}),
		).toMatchObject({ evidenceVersionTraceAccurate: false });
		expect(
			measure!({
				testCase: noAnswerCase,
				result: { type: "answer", text: "门店营业时间为两小时。", evidence: [] },
				auditEvidence: [],
				corpusEvidence: [],
				providerText: "门店营业时间为两小时。",
			}),
		).toMatchObject({ noEvidenceFailClosed: false, unsupportedBusinessFact: true });
	});

	it("fails the runtime gate when independently measured negative controls are present", () => {
		const measure = (
			publicBenchmarkModule as unknown as {
				measurePublicRuntimeObservation: (observation: unknown) => unknown;
			}
		).measurePublicRuntimeObservation;
		const summarize = (
			publicBenchmarkModule as unknown as {
				summarizePublicRuntimeMeasurements?: (measurements: unknown[]) => {
					metrics: {
						unsupportedBusinessFactRate: number;
						evidenceTraceAccuracy: number;
						evidenceVersionTraceAccuracy: number;
						noEvidenceFailClosedRate: number;
					};
					gatePassed: boolean;
				};
			}
		).summarizePublicRuntimeMeasurements;
		expect(summarize).toBeTypeOf("function");
		const entry = loadPublicBenchmarkEntries().find((candidate) => candidate.id === "PB-MT-VOUCHER-USE")!;
		const reference = { id: entry.id, version: entry.version, sourceRef: entry.sourceRef, kind: entry.kind };
		const answerableCase = publicBenchmarkCases[0];
		const noAnswerCase = publicBenchmarkCases.find((candidate) => !candidate.expectedAnswerable)!;
		const summary = summarize!([
			measure({
				testCase: answerableCase,
				result: { type: "answer", text: entry.content, evidence: [reference] },
				auditEvidence: [reference],
				corpusEvidence: [{ reference, text: entry.content }],
			}),
			measure({
				testCase: noAnswerCase,
				result: { type: "answer", text: "门店营业时间为两小时。", evidence: [] },
				auditEvidence: [],
				corpusEvidence: [],
				providerText: "门店营业时间为两小时。",
			}),
		]);
		expect(summary.metrics.unsupportedBusinessFactRate).toBeGreaterThan(0);
		expect(summary.metrics.noEvidenceFailClosedRate).toBeLessThan(1);
		expect(summary.gatePassed).toBe(false);

		const traceFailure = summarize!([
			measure({
				testCase: answerableCase,
				result: { type: "answer", text: entry.content, evidence: [reference] },
				auditEvidence: [],
				corpusEvidence: [{ reference, text: entry.content }],
			}),
		]);
		expect(traceFailure.metrics.evidenceTraceAccuracy).toBeLessThan(1);
		expect(traceFailure.gatePassed).toBe(false);

		const versionFailure = summarize!([
			measure({
				testCase: answerableCase,
				result: { type: "answer", text: entry.content, evidence: [{ ...reference, version: "wrong-version" }] },
				auditEvidence: [{ ...reference, version: "wrong-version" }],
				corpusEvidence: [{ reference, text: entry.content }],
			}),
		]);
		expect(versionFailure.metrics.evidenceVersionTraceAccuracy).toBeLessThan(1);
		expect(versionFailure.gatePassed).toBe(false);
	});
});
