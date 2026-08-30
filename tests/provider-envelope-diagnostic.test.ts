import { describe, expect, it } from "vitest";
import {
	classifySafeProviderError,
	summarizeAssistantEnvelope,
} from "../evals/selection/semantic/diagnose-provider-envelope.ts";

describe("V2.3 provider response envelope diagnostic", () => {
	it("classifies provider errors without retaining their raw message", () => {
		expect(classifySafeProviderError("request timed out while waiting")).toBe("timeout_or_abort");
		expect(classifySafeProviderError("OAuth token expired")).toBe("authentication");
		expect(classifySafeProviderError("account is not permitted for this organization")).toBe(
			"authorization_or_account",
		);
		expect(classifySafeProviderError("quota exceeded")).toBe("usage_or_quota");
		expect(classifySafeProviderError("model not found")).toBe("model_unavailable");
		expect(classifySafeProviderError("ECONNRESET while fetching")).toBe("transport_or_network");
		expect(classifySafeProviderError("upstream service overloaded")).toBe("upstream_provider");
		expect(classifySafeProviderError("unclassified provider detail")).toBe("unknown");
	});

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
