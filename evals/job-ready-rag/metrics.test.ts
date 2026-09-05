import { describe, expect, it } from "vitest";
import { jobReadyRetrievalCases, NEGATIVE_CONTROLS } from "./cases.ts";
import { getCorpusEntry, jobReadyCorpus } from "./corpus.ts";
import { freezePopulation } from "./freeze.ts";
import {
	bucketForCount,
	bucketForExpected,
	computeMetrics,
	evaluateCase,
	scopeAllowsEntry,
	scoreRun,
} from "./metrics.ts";
import type { RetrievalEvalCase, RetrievalMeasurement } from "./schema.ts";

const frozen = freezePopulation();
const corpusById = new Map(jobReadyCorpus.map((entry) => [entry.id, entry]));
const caseById = new Map(jobReadyRetrievalCases.map((item) => [item.caseId, item]));

function getCase(id: string): RetrievalEvalCase {
	const found = caseById.get(id);
	if (!found) throw new Error(`unknown case ${id}`);
	return found;
}

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
	if (evalCase.expectedAnswerability === "no_answer") {
		return measure(evalCase.caseId, { actualAnswerability: "no_answer" });
	}
	const returnedVersions: Record<string, string> = {};
	for (const id of evalCase.expectedEvidenceIds) returnedVersions[id] = evalCase.expectedVersions[id];
	return measure(evalCase.caseId, {
		returnedEvidenceIds: [...evalCase.expectedEvidenceIds],
		admittedEvidenceIds: [...evalCase.expectedEvidenceIds],
		returnedVersions,
		actualAnswerability: evalCase.expectedAnswerability === "ambiguous" ? "ambiguous" : "answerable",
	});
}

describe("routing buckets and scope mirror", () => {
	it("maps expected answerability to 0/1/2+", () => {
		expect(bucketForExpected("no_answer")).toBe("0");
		expect(bucketForExpected("answerable")).toBe("1");
		expect(bucketForExpected("ambiguous")).toBe("2+");
		expect(bucketForCount(0)).toBe("0");
		expect(bucketForCount(1)).toBe("1");
		expect(bucketForCount(2)).toBe("2+");
		expect(bucketForCount(9)).toBe("2+");
	});

	it("mirrors knowledgeScopeAllows for tenant/store boundaries", () => {
		const tenantFixture = getCorpusEntry("JR-FIX-TENANT-A");
		expect(scopeAllowsEntry(tenantFixture, { tenantId: "job-ready-tenant-a", storeId: "job-ready-store-a" })).toBe(
			true,
		);
		expect(scopeAllowsEntry(tenantFixture, { tenantId: "job-ready-tenant-b", storeId: "job-ready-store-a" })).toBe(
			false,
		);
		const unscoped = getCorpusEntry("PB-MT-VOUCHER-USE");
		expect(scopeAllowsEntry(unscoped, { tenantId: "any", storeId: "any" })).toBe(true);
	});
});

describe("evaluateCase", () => {
	it("scores a perfect answerable retrieval as a passing hit", () => {
		const evalCase = getCase("JR-RAG-ANS-01");
		const gold = evalCase.expectedEvidenceIds[0];
		const evaluation = evaluateCase(
			measure(evalCase.caseId, {
				returnedEvidenceIds: [gold],
				admittedEvidenceIds: [gold],
				returnedVersions: { [gold]: evalCase.expectedVersions[gold] },
				actualAnswerability: "answerable",
			}),
			evalCase,
			corpusById,
		);
		expect(evaluation.recallAt3).toBe(1);
		expect(evaluation.routingCorrect).toBe(true);
		expect(evaluation.wrongDistinctIds).toEqual([]);
		expect(evaluation.pass).toBe(true);
	});

	it("refuses a recall hit and flags a stale admission when the version is wrong", () => {
		const evalCase = getCase("JR-RAG-ANS-11");
		const gold = evalCase.expectedEvidenceIds[0];
		const evaluation = evaluateCase(
			measure(evalCase.caseId, {
				returnedEvidenceIds: [gold],
				admittedEvidenceIds: [gold],
				returnedVersions: { [gold]: "stale-version" },
				actualAnswerability: "answerable",
			}),
			evalCase,
			corpusById,
		);
		expect(evaluation.recallAt3).toBe(0);
		expect(evaluation.recallMissedIds).toEqual([gold]);
		expect(evaluation.staleVersionAdmissions).toEqual([gold]);
		expect(evaluation.pass).toBe(false);
	});

	it("counts a correct empty no-answer result", () => {
		const evalCase = getCase("JR-RAG-NOANS-01");
		const evaluation = evaluateCase(
			measure(evalCase.caseId, { actualAnswerability: "no_answer" }),
			evalCase,
			corpusById,
		);
		expect(evaluation.noAnswerCorrect).toBe(true);
		expect(evaluation.routingCorrect).toBe(true);
		expect(evaluation.pass).toBe(true);
	});

	it("flags a cross-scope admission plus ordinary authorization on a no-answer case", () => {
		const evalCase = getCase("JR-RAG-NOANS-01");
		const excluded = NEGATIVE_CONTROLS[evalCase.caseId].excludedEntryIds[0];
		const evaluation = evaluateCase(
			measure(evalCase.caseId, {
				returnedEvidenceIds: [excluded],
				admittedEvidenceIds: [excluded],
				returnedVersions: { [excluded]: getCorpusEntry(excluded).version },
				actualAnswerability: "answerable",
			}),
			evalCase,
			corpusById,
		);
		expect(evaluation.crossScopeAdmissions).toEqual([excluded]);
		expect(evaluation.ordinaryAuthorizationOnZeroOrMultiple).toBe(true);
		expect(evaluation.pass).toBe(false);
	});

	it("flags an unapproved admission when scope matches but status does not", () => {
		const evalCase = getCase("JR-RAG-NOANS-05");
		const excluded = NEGATIVE_CONTROLS[evalCase.caseId].excludedEntryIds[0];
		const evaluation = evaluateCase(
			measure(evalCase.caseId, {
				returnedEvidenceIds: [excluded],
				admittedEvidenceIds: [excluded],
				returnedVersions: { [excluded]: getCorpusEntry(excluded).version },
				actualAnswerability: "answerable",
			}),
			evalCase,
			corpusById,
		);
		expect(evaluation.crossScopeAdmissions).toEqual([]);
		expect(evaluation.unapprovedAdmissions).toEqual([excluded]);
		expect(evaluation.pass).toBe(false);
	});

	it("flags a retired entry as both unapproved and stale", () => {
		const evalCase = getCase("JR-RAG-NOANS-07");
		const excluded = NEGATIVE_CONTROLS[evalCase.caseId].excludedEntryIds[0];
		const evaluation = evaluateCase(
			measure(evalCase.caseId, {
				admittedEvidenceIds: [excluded],
				returnedEvidenceIds: [excluded],
				returnedVersions: { [excluded]: getCorpusEntry(excluded).version },
				actualAnswerability: "no_answer",
			}),
			evalCase,
			corpusById,
		);
		expect(evaluation.unapprovedAdmissions).toEqual([excluded]);
		expect(evaluation.staleVersionAdmissions).toEqual([excluded]);
		expect(evaluation.pass).toBe(false);
	});

	it("never counts an unavailable retrieval as a correct no-answer", () => {
		const evalCase = getCase("JR-RAG-NOANS-01");
		const evaluation = evaluateCase(
			measure(evalCase.caseId, { actualAnswerability: "unavailable", errorCategory: "retrieval_unavailable" }),
			evalCase,
			corpusById,
		);
		expect(evaluation.dependencyFailure).toBe(true);
		expect(evaluation.noAnswerCorrect).toBe(false);
		expect(evaluation.pass).toBe(false);
	});

	it("scores an ambiguous case routing to 2+ without ordinary authorization", () => {
		const evalCase = getCase("JR-RAG-AMB-01");
		const evaluation = evaluateCase(correctMeasurement(evalCase), evalCase, corpusById);
		expect(evaluation.expectedRoutingBucket).toBe("2+");
		expect(evaluation.actualRoutingBucket).toBe("2+");
		expect(evaluation.recallAt3).toBe(1);
		expect(evaluation.ordinaryAuthorizationOnZeroOrMultiple).toBe(false);
		expect(evaluation.pass).toBe(true);
	});

	it("flags ordinary authorization when an ambiguous case answers on one entry", () => {
		const evalCase = getCase("JR-RAG-AMB-01");
		const single = evalCase.expectedEvidenceIds[0];
		const evaluation = evaluateCase(
			measure(evalCase.caseId, {
				returnedEvidenceIds: [single],
				admittedEvidenceIds: [single],
				returnedVersions: { [single]: evalCase.expectedVersions[single] },
				actualAnswerability: "answerable",
			}),
			evalCase,
			corpusById,
		);
		expect(evaluation.ordinaryAuthorizationOnZeroOrMultiple).toBe(true);
		expect(evaluation.pass).toBe(false);
	});

	it("counts non-gold returns as wrong evidence even when the case still passes", () => {
		const evalCase = getCase("JR-RAG-ANS-01");
		const gold = evalCase.expectedEvidenceIds[0];
		const extras = ["PB-MT-CHANGE-REFUND", "PB-MT-REFUND-ORIGINAL-PAYMENT"];
		const evaluation = evaluateCase(
			measure(evalCase.caseId, {
				returnedEvidenceIds: [gold, ...extras],
				admittedEvidenceIds: [gold],
				returnedVersions: { [gold]: evalCase.expectedVersions[gold] },
				actualAnswerability: "answerable",
			}),
			evalCase,
			corpusById,
		);
		expect(evaluation.returnedDistinctIds).toHaveLength(3);
		expect(evaluation.wrongDistinctIds).toEqual(extras);
		expect(evaluation.recallAt3).toBe(1);
		expect(evaluation.pass).toBe(true);
	});

	it("deduplicates repeated ids before bucketing", () => {
		const evalCase = getCase("JR-RAG-ANS-01");
		const gold = evalCase.expectedEvidenceIds[0];
		const evaluation = evaluateCase(
			measure(evalCase.caseId, {
				returnedEvidenceIds: [gold, gold],
				admittedEvidenceIds: [gold, gold],
				returnedVersions: { [gold]: evalCase.expectedVersions[gold] },
				actualAnswerability: "answerable",
			}),
			evalCase,
			corpusById,
		);
		expect(evaluation.actualRoutingBucket).toBe("1");
	});
});

describe("computeMetrics", () => {
	it("reports a clean full run with invariants holding and no threshold", () => {
		const { metrics } = scoreRun(jobReadyRetrievalCases, jobReadyRetrievalCases.map(correctMeasurement));
		expect(metrics.caseCount).toBe(40);
		expect(metrics.measurementCount).toBe(40);
		expect(metrics.safetyInvariants.allHold).toBe(true);
		expect(metrics.failedCaseIds).toEqual([]);
		expect(metrics.passedCaseCount).toBe(40);
		expect(metrics.recallAnswerable.macroRecallAt3).toBe(1);
		expect(metrics.recallAmbiguous.macroRecallAt3).toBe(1);
		expect(metrics.routingAccuracy).toBe(1);
		expect(metrics.noAnswerAccuracy).toBe(1);
		expect(metrics.wrongEvidenceRate).toBe(0);
		expect(metrics.coverage).toBe(0.8);
		expect(metrics.gap05.status).toBe("unresolved");
		expect(Object.keys(metrics)).not.toContain("qualityThreshold");
		expect(Object.keys(metrics)).not.toContain("passThreshold");
	});

	it("makes all-empty retrieval look bad: N/A WER, zero coverage, many failures", () => {
		const empty = jobReadyRetrievalCases.map((item) => measure(item.caseId, { actualAnswerability: "no_answer" }));
		const { metrics } = scoreRun(jobReadyRetrievalCases, empty);
		expect(metrics.wrongEvidenceRate).toBeNull();
		expect(metrics.coverage).toBe(0);
		expect(metrics.recallAnswerable.macroRecallAt3).toBe(0);
		expect(metrics.noAnswerAccuracy).toBe(1);
		expect(metrics.passedCaseCount).toBe(8);
		expect(metrics.failedCaseIds).toHaveLength(32);
	});

	it("computes deterministic latency percentiles with separate timeout/error counts", () => {
		const ids = ["JR-RAG-ANS-01", "JR-RAG-ANS-02", "JR-RAG-ANS-03", "JR-RAG-ANS-04"];
		const times = [5, 10, 15, 20];
		const evaluations = ids.map((id, index) =>
			evaluateCase(
				measure(id, {
					elapsedMs: times[index],
					...(index === 3 ? { actualAnswerability: "unavailable", errorCategory: "upstream_timeout" } : {}),
				}),
				getCase(id),
				corpusById,
			),
		);
		const { latency } = computeMetrics(evaluations);
		expect(latency.count).toBe(4);
		expect(latency.min).toBe(5);
		expect(latency.p50).toBe(10);
		expect(latency.p95).toBe(20);
		expect(latency.max).toBe(20);
		expect(latency.timeoutCount).toBe(1);
		expect(latency.errorCount).toBe(1);
	});

	it("marks unmeasured population cases as missing failures", () => {
		const partial = [
			measure("JR-RAG-ANS-01", {
				returnedEvidenceIds: ["PB-MT-VOUCHER-USE"],
				admittedEvidenceIds: ["PB-MT-VOUCHER-USE"],
				returnedVersions: { "PB-MT-VOUCHER-USE": "mt-terms-1.6-2026-04-23" },
				actualAnswerability: "answerable",
			}),
		];
		const { evaluations, metrics } = scoreRun(jobReadyRetrievalCases, partial);
		expect(metrics.caseCount).toBe(40);
		expect(metrics.measurementCount).toBe(1);
		expect(evaluations.filter((item) => item.missing)).toHaveLength(39);
		expect(evaluations.filter((item) => item.missing).every((item) => !item.pass)).toBe(true);
		expect(metrics.failedCaseIds).toContain("JR-RAG-ANS-02");
	});

	it("rejects two measurements for one case in a single-mode run", () => {
		const duplicated = [measure("JR-RAG-ANS-01"), measure("JR-RAG-ANS-01")];
		expect(() => scoreRun(jobReadyRetrievalCases, duplicated)).toThrow(/Duplicate measurement/);
	});
});
