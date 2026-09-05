import { describe, expect, it } from "vitest";
import {
	assertKeySet,
	parseCorpusEntry,
	parseRetrievalEvalCase,
	parseRetrievalMeasurement,
	parseScope,
} from "./schema.ts";

function validCase() {
	return {
		caseId: "JR-RAG-TEST-01",
		query: "团购券过期还能用吗",
		scope: { tenantId: "public-benchmark", storeId: "public-benchmark-store" },
		expectedEvidenceIds: ["PB-MT-VOUCHER-USE"],
		expectedAnswerability: "answerable",
		expectedVersions: { "PB-MT-VOUCHER-USE": "mt-terms-1.6-2026-04-23" },
		expectedSourceRefs: {
			"PB-MT-VOUCHER-USE": "https://rules-center.meituan.com/m/detail/guize/1?activeRule=1#section-7",
		},
		provenance: "human_authored_official_source",
		sourceRefs: ["https://rules-center.meituan.com/m/detail/guize/1?activeRule=1#section-7"],
		goldReason: "直接命中有效期条款，单条即充分。",
	};
}

function validMeasurement() {
	return {
		caseId: "JR-RAG-TEST-01",
		sourceCommit: "abc123",
		casesSha256: "a".repeat(64),
		corpusSha256: "b".repeat(64),
		mode: "lexical",
		returnedEvidenceIds: ["PB-MT-VOUCHER-USE"],
		admittedEvidenceIds: ["PB-MT-VOUCHER-USE"],
		returnedVersions: { "PB-MT-VOUCHER-USE": "mt-terms-1.6-2026-04-23" },
		actualAnswerability: "answerable",
		elapsedMs: 12,
		pass: true,
		failureReasons: [],
	};
}

describe("schema parsers fail closed", () => {
	it("accepts a well-formed scope and rejects deviations", () => {
		expect(parseScope({ tenantId: "t", storeId: "s" })).toEqual({ tenantId: "t", storeId: "s" });
		expect(() => parseScope({ tenantId: "t" })).toThrow();
		expect(() => parseScope({ tenantId: "t", storeId: "s", extra: 1 })).toThrow();
		expect(() => parseScope({ tenantId: "", storeId: "s" })).toThrow();
		expect(() => parseScope(null)).toThrow();
	});

	it("round-trips a valid RetrievalEvalCase", () => {
		const parsed = parseRetrievalEvalCase(validCase());
		expect(parsed.caseId).toBe("JR-RAG-TEST-01");
		expect(parsed.expectedAnswerability).toBe("answerable");
	});

	it("rejects an unknown key, a bad enum and a non-array on a case", () => {
		expect(() => parseRetrievalEvalCase({ ...validCase(), surprise: true })).toThrow(/Unexpected key/);
		expect(() => parseRetrievalEvalCase({ ...validCase(), expectedAnswerability: "maybe" })).toThrow();
		expect(() => parseRetrievalEvalCase({ ...validCase(), expectedEvidenceIds: "PB-MT-VOUCHER-USE" })).toThrow();
		expect(() => parseRetrievalEvalCase({ ...validCase(), goldReason: "  " })).toThrow();
	});

	it("round-trips a valid lexical measurement and its optionals", () => {
		const parsed = parseRetrievalMeasurement(validMeasurement());
		expect(parsed.mode).toBe("lexical");
		expect(parsed.errorCategory).toBeUndefined();
		const withOptionals = parseRetrievalMeasurement({
			...validMeasurement(),
			errorCategory: "retrieval_unavailable",
		});
		expect(withOptionals.errorCategory).toBe("retrieval_unavailable");
	});

	it("rejects a vector measurement without an embedding profile", () => {
		expect(() => parseRetrievalMeasurement({ ...validMeasurement(), mode: "vector" })).toThrow(/embeddingProfileId/);
		const vector = parseRetrievalMeasurement({
			...validMeasurement(),
			mode: "vector",
			embeddingProfileId: "profile-1",
		});
		expect(vector.embeddingProfileId).toBe("profile-1");
	});

	it("rejects negative latency, extra keys and a bad answerability on a measurement", () => {
		expect(() => parseRetrievalMeasurement({ ...validMeasurement(), elapsedMs: -1 })).toThrow();
		expect(() => parseRetrievalMeasurement({ ...validMeasurement(), extra: 1 })).toThrow(/Unexpected key/);
		expect(() => parseRetrievalMeasurement({ ...validMeasurement(), actualAnswerability: "answerable!" })).toThrow();
	});

	it("parses a corpus entry and enforces storeScope requires tenantScope", () => {
		const entry = parseCorpusEntry({
			id: "X",
			kind: "policy",
			status: "approved",
			version: "v1",
			updatedAt: "2026-01-01",
			sourceRef: "test://x",
			provenance: "synthetic_isolation_fixture",
		});
		expect(entry.id).toBe("X");
		expect(() =>
			parseCorpusEntry({
				id: "Y",
				kind: "policy",
				status: "approved",
				version: "v1",
				updatedAt: "2026-01-01",
				sourceRef: "test://y",
				storeScope: "s",
				provenance: "synthetic_isolation_fixture",
			}),
		).toThrow(/storeScope requires tenantScope/);
		expect(() => parseCorpusEntry({ id: "Z", kind: "nope" })).toThrow();
	});

	it("assertKeySet rejects missing and unexpected keys", () => {
		expect(() => assertKeySet({ a: 1 }, ["a", "b"])).toThrow(/Missing required key: b/);
		expect(() => assertKeySet({ a: 1, c: 2 }, ["a"])).toThrow(/Unexpected key: c/);
		expect(() => assertKeySet({ a: 1, b: 2 }, ["a"], ["b"])).not.toThrow();
	});
});
