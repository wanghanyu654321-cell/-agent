import { describe, expect, it } from "vitest";
import {
	OneShotSemanticEvidenceSelector,
	parseSemanticSelectionOutput,
	type SemanticSelectionInput,
} from "../src/semantic-selector.ts";

const input: SemanticSelectionInput = {
	query: "退款后钱怎么退回来？",
	candidates: [
		{ label: "A", title: "退款到账路径", content: "退款按原支付路径退回。" },
		{ label: "B", title: "未消费退款", content: "未消费团购券可申请退款。" },
	],
};

describe("V2.3 bounded semantic evidence selector", () => {
	it("accepts only an exact structured candidate label or ABSTAIN", () => {
		expect(parseSemanticSelectionOutput('{"selection":"A"}', ["A", "B"])).toEqual({
			selection: "A",
			outcome: "selected",
		});
		for (const output of [
			'{"selection":"C"}',
			'{"selection":"A","reason":"extra"}',
			'{"selection":"A"}\nexplanation',
			"A",
			"",
		]) {
			expect(parseSemanticSelectionOutput(output, ["A", "B"])).toEqual({ selection: "ABSTAIN", outcome: "invalid" });
		}
	});

	it("maps a valid one-shot classification to an opaque label without exposing internal IDs", async () => {
		let request = "";
		const selector = new OneShotSemanticEvidenceSelector({
			complete: async (_signal, modelInput) => {
				request = modelInput;
				return '{"selection":"A"}';
			},
		});

		await expect(selector.select(input, new AbortController().signal)).resolves.toEqual({
			selection: "A",
			outcome: "selected",
		});
		expect(request).toContain('"label":"A"');
		expect(request).not.toContain("PB-MT-");
	});

	it("fails closed for provider failure, empty output, and caller cancellation", async () => {
		const failure = new OneShotSemanticEvidenceSelector({
			complete: async () => Promise.reject(new Error("provider failed")),
		});
		const empty = new OneShotSemanticEvidenceSelector({ complete: async () => "" });
		const cancelled = new OneShotSemanticEvidenceSelector({
			complete: async (signal) =>
				new Promise<string>((resolve) =>
					signal.addEventListener("abort", () => resolve('{"selection":"A"}'), { once: true }),
				),
		});
		const controller = new AbortController();
		controller.abort();

		await expect(failure.select(input, new AbortController().signal)).resolves.toEqual({
			selection: "ABSTAIN",
			outcome: "provider_error",
		});
		await expect(empty.select(input, new AbortController().signal)).resolves.toEqual({
			selection: "ABSTAIN",
			outcome: "invalid",
		});
		await expect(cancelled.select(input, controller.signal)).resolves.toEqual({
			selection: "ABSTAIN",
			outcome: "timeout",
		});
	});
});
