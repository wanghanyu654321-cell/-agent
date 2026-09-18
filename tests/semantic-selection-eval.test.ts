import { describe, expect, it } from "vitest";
import { runSemanticSelectionEvaluation } from "../evals/selection/semantic/evaluation.ts";
import type { SemanticEvidenceSelector } from "../src/semantic-selector.ts";

const contentClassifier: SemanticEvidenceSelector = {
	async select(input) {
		const candidate = input.candidates.find((item) => item.content.includes("ORIGINAL_PAYMENT"));
		return candidate
			? { selection: candidate.label, outcome: "selected" }
			: { selection: "ABSTAIN", outcome: "abstained" };
	},
};

describe("V2.3 offline semantic-selection evaluation", () => {
	it("calculates direct and semantic selections independently while checking candidate-order robustness", async () => {
		const result = await runSemanticSelectionEvaluation(
			[
				{
					caseId: "single",
					query: "single query",
					expectedEvidenceId: "gold-single",
					candidates: [{ id: "gold-single", title: "single", content: "SINGLE" }],
				},
				{
					caseId: "ambiguous",
					query: "refund destination",
					expectedEvidenceId: "gold-payment",
					candidates: [
						{ id: "wrong-refund", title: "refund", content: "UNCONSUMED_REFUND" },
						{ id: "gold-payment", title: "payment", content: "ORIGINAL_PAYMENT" },
					],
				},
			],
			contentClassifier,
		);

		expect(result.metrics).toMatchObject({
			correctSelectionRate: 1,
			wrongSelectionRate: 0,
			answerableCoverage: 1,
			selectedEvidencePrecision: 1,
			multiCandidateWrongSelectionRate: 0,
			orderInducedWrongSelectionRate: 0,
		});
		expect(result.semanticCalls).toBe(2);
		expect(result.traceSummary).toEqual({
			primary: { selected: 1, abstained: 0, invalid: 0, timeout: 0, providerError: 0 },
			reversed: { selected: 1, abstained: 0, invalid: 0, timeout: 0, providerError: 0 },
			rawOutputShapes: {},
			correct: 2,
			wrong: 0,
			nonSelection: 0,
		});
		expect(result.traces).toEqual([
			{
				caseId: "ambiguous",
				order: "primary",
				candidateCount: 2,
				candidates: [
					{ label: "A", evidenceId: "wrong-refund" },
					{ label: "B", evidenceId: "gold-payment" },
				],
				outcome: "selected",
				selection: "B",
				mappedEvidenceId: "gold-payment",
				expectedEvidenceId: "gold-payment",
				classification: "correct",
				elapsedMs: expect.any(Number),
			},
			{
				caseId: "ambiguous",
				order: "reversed",
				candidateCount: 2,
				candidates: [
					{ label: "A", evidenceId: "gold-payment" },
					{ label: "B", evidenceId: "wrong-refund" },
				],
				outcome: "selected",
				selection: "A",
				mappedEvidenceId: "gold-payment",
				expectedEvidenceId: "gold-payment",
				classification: "correct",
				elapsedMs: expect.any(Number),
			},
		]);
	});

	it("fails the semantic gate when a multi-candidate selection is wrong", async () => {
		const wrong: SemanticEvidenceSelector = {
			async select() {
				return { selection: "A", outcome: "selected" };
			},
		};
		const result = await runSemanticSelectionEvaluation(
			[
				{
					caseId: "wrong",
					query: "query",
					expectedEvidenceId: "gold",
					candidates: [
						{ id: "wrong", title: "wrong", content: "WRONG" },
						{ id: "gold", title: "gold", content: "GOLD" },
					],
				},
			],
			wrong,
		);
		expect(result.metrics.wrongSelectionRate).toBe(1);
		expect(result.gatePassed).toBe(false);
	});

	it("does not mislabel an already-wrong selection as order-induced", async () => {
		const alwaysFirst: SemanticEvidenceSelector = {
			async select() {
				return { selection: "A", outcome: "selected" };
			},
		};
		const result = await runSemanticSelectionEvaluation(
			[
				{
					caseId: "already-wrong",
					query: "query",
					expectedEvidenceId: "gold",
					candidates: [
						{ id: "wrong-one", title: "wrong one", content: "WRONG_ONE" },
						{ id: "gold", title: "gold", content: "GOLD" },
						{ id: "wrong-two", title: "wrong two", content: "WRONG_TWO" },
					],
				},
			],
			alwaysFirst,
		);
		expect(result.metrics.orderInducedWrongSelectionRate).toBe(0);
	});

	it("records per-invocation latency and preserves timeout/provider error rates", async () => {
		let call = 0;
		const failing: SemanticEvidenceSelector = {
			async select() {
				call += 1;
				return call === 1
					? { selection: "ABSTAIN", outcome: "provider_error" }
					: { selection: "ABSTAIN", outcome: "timeout" };
			},
		};
		const result = await runSemanticSelectionEvaluation(
			[
				{
					caseId: "infrastructure-outcomes",
					query: "query",
					expectedEvidenceId: "gold",
					candidates: [
						{ id: "gold", title: "gold", content: "GOLD" },
						{ id: "other", title: "other", content: "OTHER" },
					],
				},
			],
			failing,
		);

		expect(result.metrics.providerErrorRate).toBe(0.5);
		expect(result.metrics.timeoutRate).toBe(0.5);
		expect(result.traces.every((trace) => typeof trace.elapsedMs === "number" && trace.elapsedMs >= 0)).toBe(true);
		expect(result.latency).toMatchObject({
			minMs: expect.any(Number),
			p50Ms: expect.any(Number),
			p95Ms: expect.any(Number),
			maxMs: expect.any(Number),
		});
		expect(result.latency.minMs).toBeLessThanOrEqual(result.latency.p50Ms);
		expect(result.latency.p50Ms).toBeLessThanOrEqual(result.latency.p95Ms);
		expect(result.latency.p95Ms).toBeLessThanOrEqual(result.latency.maxMs);
	});

	it("persists the primary trace before beginning the reversed invocation", async () => {
		const events: string[] = [];
		const selector: SemanticEvidenceSelector = {
			async select(input) {
				events.push(`select:${input.candidates.map((candidate) => candidate.content).join(",")}`);
				return { selection: "A", outcome: "selected" };
			},
		};

		await runSemanticSelectionEvaluation(
			[
				{
					caseId: "durable-order",
					query: "query",
					expectedEvidenceId: "gold",
					candidates: [
						{ id: "gold", title: "gold", content: "GOLD" },
						{ id: "other", title: "other", content: "OTHER" },
					],
				},
			],
			selector,
			{
				async onInvocationComplete(trace) {
					events.push(`persist:${trace.order}`);
				},
			},
		);

		expect(events).toEqual(["select:GOLD,OTHER", "persist:primary", "select:OTHER,GOLD", "persist:reversed"]);
	});

	it("stops before the next semantic invocation when trace persistence fails", async () => {
		let calls = 0;
		const selector: SemanticEvidenceSelector = {
			async select() {
				calls += 1;
				return { selection: "A", outcome: "selected" };
			},
		};

		await expect(
			runSemanticSelectionEvaluation(
				[
					{
						caseId: "persistence-failure",
						query: "query",
						expectedEvidenceId: "gold",
						candidates: [
							{ id: "gold", title: "gold", content: "GOLD" },
							{ id: "other", title: "other", content: "OTHER" },
						],
					},
				],
				selector,
				{
					onInvocationComplete() {
						throw new Error("journal write failed");
					},
				},
			),
		).rejects.toThrow("journal write failed");
		expect(calls).toBe(1);
	});
});
