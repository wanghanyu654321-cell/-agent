import { describe, expect, it } from "vitest";
import {
	ensureGateReportDoesNotExist,
	hashFrozenPrompt,
	REAL_MODEL_EVAL_TIMEOUT_MS,
} from "../evals/selection/semantic/run-oauth-aware-gate.ts";

describe("V2.3 OAuth-aware semantic Gate runner", () => {
	it("uses the fixed evaluation-only timeout and refuses to overwrite its first report", () => {
		expect(REAL_MODEL_EVAL_TIMEOUT_MS).toBe(15_000);
		expect(() => ensureGateReportDoesNotExist("existing-report.json", () => true)).toThrow(
			"already exists and will not be overwritten",
		);
		expect(() => ensureGateReportDoesNotExist("new-report.json", () => false)).not.toThrow();
	});

	it("hashes the frozen prompt as text rather than as a JSON string value", () => {
		expect(hashFrozenPrompt("prompt")).toBe("cf07194ee232eb531e15f690000d19846dea69cf05504782658afcfacb9228a2");
	});
});
