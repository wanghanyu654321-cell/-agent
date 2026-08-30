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
	it("accepts JSON documents with surrounding whitespace while preserving the exact schema", () => {
		for (const output of [
			'{"selection":"A"}',
			' {"selection":"A"}',
			'{"selection":"A"}\n',
			'\n{"selection":"ABSTAIN"}\n',
		]) {
			expect(parseSemanticSelectionOutput(output, ["A", "B"])).toEqual({
				selection: output.includes("ABSTAIN") ? "ABSTAIN" : "A",
				outcome: output.includes("ABSTAIN") ? "abstained" : "selected",
			});
		}
		for (const output of [
			'{"selection":"C"}',
			'{"selection":"A","reason":"extra"}',
			'```json\n{"selection":"A"}\n```',
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
			observation: {
				rawOutputShape: "exact_json",
				rawOutputLength: 17,
				rawOutputSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
			},
		});
		expect(request).toContain('"label":"A"');
		expect(request).not.toContain("PB-MT-");
	});

	it("records only a sanitized shape, hash, and length for a whitespace-wrapped model response", async () => {
		const output = ' {"selection":"A"}\n';
		const selector = new OneShotSemanticEvidenceSelector({ complete: async () => output });

		await expect(selector.select(input, new AbortController().signal)).resolves.toMatchObject({
			selection: "A",
			outcome: "selected",
			observation: {
				rawOutputShape: "surrounding_whitespace_json",
				rawOutputLength: output.length,
			},
		});
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
			observation: {
				rawOutputShape: "empty",
				rawOutputLength: 0,
				rawOutputSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
			},
		});
		await expect(cancelled.select(input, controller.signal)).resolves.toEqual({
			selection: "ABSTAIN",
			outcome: "timeout",
		});
	});
});
