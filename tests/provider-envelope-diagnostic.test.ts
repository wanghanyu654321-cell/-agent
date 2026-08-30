import { describe, expect, it } from "vitest";
import { summarizeAssistantEnvelope } from "../evals/selection/semantic/diagnose-provider-envelope.ts";

describe("V2.3 provider response envelope diagnostic", () => {
	it("records only safe envelope metadata and never text or thinking content", () => {
		const summary = summarizeAssistantEnvelope({
			provider: "openai-codex",
			model: "gpt-5.6-sol",
			responseModel: "gpt-5.6-sol-2026-08-01",
			responseId: "resp-private-id",
			content: [
				{ type: "thinking", thinking: "private reasoning" },
				{ type: "text", text: '{"selection":"A"}' },
				{ type: "toolCall", id: "call-private", name: "tool", arguments: {} },
			],
			usage: { input: 12, output: 7, reasoning: 5, totalTokens: 19 },
			stopReason: "stop",
			rawStopReason: "completed",
			endTurn: true,
			errorMessage: "private provider detail",
			diagnostics: [
				{ type: "provider_transport_failure", timestamp: 1, error: { code: "ECONNRESET", message: "private" } },
			],
		});

		expect(summary).toEqual({
			provider: "openai-codex",
			model: "gpt-5.6-sol",
			responseModel: "gpt-5.6-sol-2026-08-01",
			stopReason: "stop",
			rawStopReason: "completed",
			endTurn: true,
			errorMessagePresent: true,
			responseIdPresent: true,
			contentBlockCount: 3,
			contentBlockTypes: ["thinking", "text", "toolCall"],
			textBlockCount: 1,
			totalTextLength: 17,
			thinkingBlockCount: 1,
			totalThinkingLength: 17,
			usage: { input: 12, output: 7, reasoning: 5, totalTokens: 19 },
			diagnosticTypes: ["provider_transport_failure"],
			diagnosticCodes: ["ECONNRESET"],
		});
		expect(JSON.stringify(summary)).not.toContain("private reasoning");
		expect(JSON.stringify(summary)).not.toContain('"selection":"A"');
		expect(JSON.stringify(summary)).not.toContain("resp-private-id");
		expect(JSON.stringify(summary)).not.toContain("private provider detail");
	});
});
