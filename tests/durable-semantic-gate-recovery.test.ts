import { describe, expect, it } from "vitest";
import {
	reconstructSemanticSelectionEvaluation,
	runSemanticSelectionEvaluation,
} from "../evals/selection/semantic/evaluation.ts";
import type { SemanticEvidenceSelector } from "../src/semantic-selector.ts";

const cases = [
	{
		caseId: "single",
		query: "single",
		expectedEvidenceId: "single-gold",
		candidates: [{ id: "single-gold", title: "single", content: "SINGLE" }],
	},
	{
		caseId: "multi",
		query: "multi",
		expectedEvidenceId: "gold",
		candidates: [
			{ id: "gold", title: "gold", content: "GOLD" },
			{ id: "other", title: "other", content: "OTHER" },
		],
	},
];

const goldSelector: SemanticEvidenceSelector = {
	async select(input) {
		return {
			selection: input.candidates.find((candidate) => candidate.content === "GOLD")!.label,
			outcome: "selected",
		};
	},
};

describe("durable semantic Gate reconstruction", () => {
	it("does not publish Gate metrics from an incomplete persisted journal", async () => {
		const evaluation = await runSemanticSelectionEvaluation(cases, goldSelector);
		const recovery = reconstructSemanticSelectionEvaluation(cases, [{ ...evaluation.traces[0]!, sequence: 1 }]);

		expect(recovery).toMatchObject({
			status: "infrastructure_blocked",
			expectedSemanticCalls: 2,
			persistedSemanticCalls: 1,
			gatePassed: false,
		});
		expect(recovery.metrics).toBeUndefined();
	});

	it("publishes Gate metrics only for a complete unique trace set", async () => {
		const evaluation = await runSemanticSelectionEvaluation(cases, goldSelector);
		const recovery = reconstructSemanticSelectionEvaluation(
			cases,
			evaluation.traces.map((trace, index) => ({ ...trace, sequence: index + 1 })),
		);

		expect(recovery).toMatchObject({
			status: "complete",
			expectedSemanticCalls: 2,
			persistedSemanticCalls: 2,
			gatePassed: true,
		});
		expect(recovery.metrics).toMatchObject(evaluation.metrics);
	});

	it("fails closed when persisted records duplicate the same case and order", async () => {
		const evaluation = await runSemanticSelectionEvaluation(cases, goldSelector);
		const primary = { ...evaluation.traces[0]!, sequence: 1 };
		const recovery = reconstructSemanticSelectionEvaluation(cases, [primary, { ...primary, sequence: 2 }]);

		expect(recovery).toMatchObject({ status: "infrastructure_blocked", gatePassed: false });
		expect(recovery.reason).toContain("duplicate");
	});
});
