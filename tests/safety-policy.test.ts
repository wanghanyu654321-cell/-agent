import { describe, expect, it } from "vitest";
import {
	ApprovedSafetyRetrievalService,
	decideSafety,
	detectSafetyRisk,
	type SafetyKnowledgeEntry,
} from "../src/safety.ts";

const syntheticFixture: SafetyKnowledgeEntry = {
	id: "synthetic-allergy-pause",
	domain: "safety",
	riskCategory: "allergy",
	status: "synthetic_test_only",
	version: "fixture-v1",
	updatedAt: "2026-08-28",
	scope: ["pause"],
	evidenceText: "NON-PRODUCTION synthetic workflow fixture.",
	allowedOptions: [{ action: "fixture option", risk: "fixture risk", likelyResult: "fixture result" }],
	requiresEscalation: false,
};

describe("V1 safety policy", () => {
	it("detects potential professional risk without making a diagnosis", () => {
		expect(detectSafetyRisk("顾客说可能过敏，怎么处理？")).toBe("allergy");
		expect(detectSafetyRisk("顾客说皮肤异常，怎么处理？")).toBe("skin_abnormality");
		expect(detectSafetyRisk("设备安全相关问题。 ")).toBe("device_safety");
		expect(detectSafetyRisk("这个情况是否有禁忌？")).toBe("contraindication");
		expect(detectSafetyRisk("存在专业风险，但我不确定。 ")).toBe("unknown_professional_risk");
		expect(detectSafetyRisk("普通营业时间咨询")).toBeUndefined();
	});

	it("rejects synthetic fixtures from production retrieval", async () => {
		const retrieval = new ApprovedSafetyRetrievalService([syntheticFixture]);
		await expect(retrieval.search("过敏 pause", new AbortController().signal)).resolves.toEqual([]);
	});

	it("allows synthetic fixtures only in explicit test mode", async () => {
		const retrieval = new ApprovedSafetyRetrievalService([syntheticFixture], { allowSyntheticTestFixtures: true });
		const evidence = await retrieval.search("过敏 pause", new AbortController().signal);
		expect(evidence.map((item) => item.id)).toEqual(["synthetic-allergy-pause"]);
	});

	it("does not return another risk category merely because a scope word matches", async () => {
		const approved = { ...syntheticFixture, status: "approved" as const };
		const retrieval = new ApprovedSafetyRetrievalService([approved]);
		await expect(retrieval.search("皮肤异常 pause", new AbortController().signal)).resolves.toEqual([]);
	});

	it("honors an already-aborted retrieval signal", async () => {
		const retrieval = new ApprovedSafetyRetrievalService([syntheticFixture]);
		const controller = new AbortController();
		controller.abort();
		await expect(retrieval.search("过敏 pause", controller.signal)).rejects.toThrow(
			"Safety knowledge search aborted.",
		);
	});

	it("fails closed and requires qualified-human escalation without approved evidence", () => {
		expect(decideSafety("allergy", [], false).disposition).toBe("escalate");
	});

	it("fails closed for partial evidence", () => {
		const partial = { ...syntheticFixture, status: "approved" as const, scope: ["different-action"] };
		expect(decideSafety("allergy", [partial], false, "pause").disposition).toBe("escalate");
	});

	it("permits no more approved options than the evidence provides", () => {
		const approved = { ...syntheticFixture, status: "approved" as const };
		const decision = decideSafety("allergy", [approved], false, "pause");
		expect(decision.disposition).toBe("supported");
		expect(decision.options).toHaveLength(1);
	});
});
