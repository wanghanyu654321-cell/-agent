import { describe, expect, it } from "vitest";
import { jobReadyRetrievalCases, NEGATIVE_CONTROLS } from "./cases.ts";
import {
	APPROVED_CORPUS_SOURCE_PATH,
	approvedPublicBenchmarkCorpus,
	getCorpusEntry,
	jobReadyCorpus,
	syntheticIsolationFixtures,
} from "./corpus.ts";
import { assertValidPopulation, canonicalJson, freezePopulation, hashPopulation } from "./freeze.ts";

const byId = new Map(jobReadyRetrievalCases.map((item) => [item.caseId, item]));

function countOf(answerability: "answerable" | "no_answer" | "ambiguous"): number {
	return jobReadyRetrievalCases.filter((item) => item.expectedAnswerability === answerability).length;
}

describe("frozen retrieval population", () => {
	it("holds exactly 40 cases split 24/8/8", () => {
		expect(jobReadyRetrievalCases).toHaveLength(40);
		expect(countOf("answerable")).toBe(24);
		expect(countOf("no_answer")).toBe(8);
		expect(countOf("ambiguous")).toBe(8);
	});

	it("uses unique case ids", () => {
		expect(new Set(jobReadyRetrievalCases.map((item) => item.caseId)).size).toBe(40);
	});

	it("distinguishes approved-source cases from synthetic isolation fixtures", () => {
		const human = jobReadyRetrievalCases.filter((item) => item.provenance === "human_authored_official_source");
		const synthetic = jobReadyRetrievalCases.filter((item) => item.provenance === "synthetic_isolation_fixture");
		expect(human).toHaveLength(32);
		expect(synthetic).toHaveLength(8);
		expect(synthetic.every((item) => item.expectedAnswerability === "no_answer")).toBe(true);
	});

	it("gives answerable exactly one gold, ambiguous at least two distinct, no-answer none", () => {
		for (const item of jobReadyRetrievalCases) {
			if (item.expectedAnswerability === "answerable") expect(item.expectedEvidenceIds).toHaveLength(1);
			if (item.expectedAnswerability === "ambiguous") {
				expect(new Set(item.expectedEvidenceIds).size).toBeGreaterThanOrEqual(2);
			}
			if (item.expectedAnswerability === "no_answer") {
				expect(item.expectedEvidenceIds).toHaveLength(0);
				expect(item.expectedVersions).toEqual({});
				expect(item.expectedSourceRefs).toEqual({});
			}
		}
	});

	it("binds every gold id, version and source ref to the frozen corpus", () => {
		for (const item of jobReadyRetrievalCases) {
			for (const id of item.expectedEvidenceIds) {
				const entry = getCorpusEntry(id);
				expect(item.expectedVersions[id]).toBe(entry.version);
				expect(item.expectedSourceRefs[id]).toBe(entry.sourceRef);
			}
		}
	});

	it("covers all four negative-control dimensions with at least eight controls", () => {
		const ids = Object.keys(NEGATIVE_CONTROLS);
		expect(ids.length).toBeGreaterThanOrEqual(8);
		const dimensions = new Set(Object.values(NEGATIVE_CONTROLS).map((control) => control.dimension));
		for (const required of ["tenant_isolation", "store_isolation", "unapproved_evidence", "stale_version"]) {
			expect(dimensions.has(required as never)).toBe(true);
		}
		for (const id of ids) {
			expect(byId.get(id)?.expectedAnswerability).toBe("no_answer");
			for (const excluded of NEGATIVE_CONTROLS[id].excludedEntryIds) {
				expect(getCorpusEntry(excluded).provenance).toBe("synthetic_isolation_fixture");
			}
		}
	});

	it("carries a human goldReason on every case", () => {
		expect(jobReadyRetrievalCases.every((item) => item.goldReason.trim().length > 0)).toBe(true);
	});
});

describe("frozen corpus manifest", () => {
	it("projects 13 approved entries and 6 synthetic fixtures", () => {
		expect(approvedPublicBenchmarkCorpus).toHaveLength(13);
		expect(syntheticIsolationFixtures).toHaveLength(6);
		expect(jobReadyCorpus).toHaveLength(19);
		expect(approvedPublicBenchmarkCorpus.every((entry) => entry.sourcePath === APPROVED_CORPUS_SOURCE_PATH)).toBe(
			true,
		);
		expect(approvedPublicBenchmarkCorpus.every((entry) => entry.status === "approved")).toBe(true);
	});

	it("has unique ids and ingestable synthetic fixtures", () => {
		expect(new Set(jobReadyCorpus.map((entry) => entry.id)).size).toBe(19);
		for (const fixture of syntheticIsolationFixtures) {
			expect(fixture.provenance).toBe("synthetic_isolation_fixture");
			expect(fixture.content.length).toBeGreaterThan(0);
			expect(fixture.tags.length).toBeGreaterThan(0);
			expect(fixture.sourceRef.startsWith("test://job-ready/synthetic/")).toBe(true);
		}
	});

	it("fails closed on an unknown corpus id", () => {
		expect(() => getCorpusEntry("DOES-NOT-EXIST")).toThrow();
	});
});

describe("deterministic freeze", () => {
	it("validates the population without throwing", () => {
		expect(() => assertValidPopulation()).not.toThrow();
	});

	it("produces stable 64-hex digests across repeated freezes", () => {
		const first = freezePopulation();
		const second = freezePopulation();
		expect(first.casesSha256).toBe(second.casesSha256);
		expect(first.corpusSha256).toBe(second.corpusSha256);
		expect(first.casesSha256).toMatch(/^[0-9a-f]{64}$/);
		expect(first.corpusSha256).toMatch(/^[0-9a-f]{64}$/);
		expect(first.caseCount).toBe(40);
		expect(first.negativeControlCount).toBeGreaterThanOrEqual(8);
	});

	it("canonicalizes independent of key insertion order", () => {
		expect(hashPopulation({ a: 1, b: { c: 2, d: 3 } })).toBe(hashPopulation({ b: { d: 3, c: 2 }, a: 1 }));
		expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
	});

	it("detects tampering: any case change moves the digest", () => {
		const baseline = freezePopulation().casesSha256;
		const tampered = jobReadyRetrievalCases.map((item) => ({ ...item }));
		tampered[0].query = `${tampered[0].query}（篡改）`;
		expect(hashPopulation(tampered)).not.toBe(baseline);
	});

	it("rejects a population that violates the 24/8/8 split", () => {
		const broken = jobReadyRetrievalCases.slice(0, 39);
		expect(() => assertValidPopulation(broken)).toThrow();
	});
});
