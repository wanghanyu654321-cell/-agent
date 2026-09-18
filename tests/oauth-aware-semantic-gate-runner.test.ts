import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	ensureGateReportDoesNotExist,
	hashFrozenPrompt,
	OAUTH_AWARE_GATE_RECOVERY_ATTEMPT_MANIFEST,
	OAUTH_AWARE_GATE_RECOVERY_REPORT,
	OAUTH_AWARE_GATE_RECOVERY_TRACES,
	REAL_MODEL_EVAL_TIMEOUT_MS,
	resolveSourceCommit,
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

	it("uses a distinct write-once recovery-2 identity for the authorized rerun", () => {
		expect(OAUTH_AWARE_GATE_RECOVERY_ATTEMPT_MANIFEST).toBe(
			"oauth-aware-semantic-gate-recovery-2-attempt-manifest.json",
		);
		expect(OAUTH_AWARE_GATE_RECOVERY_TRACES).toBe("oauth-aware-semantic-gate-recovery-2-traces.jsonl");
		expect(OAUTH_AWARE_GATE_RECOVERY_REPORT).toBe("oauth-aware-semantic-gate-recovery-2-run.json");
	});

	it("resolves provenance through one repository-scoped safe.directory Git invocation", () => {
		const calls: unknown[][] = [];
		const repositoryDirectory = resolve(process.cwd(), "workspace", "customer-support-agent");
		const sourceCommit = resolveSourceCommit(repositoryDirectory, ((
			command: string,
			args: string[],
			options: unknown,
		) => {
			calls.push([command, args, options]);
			return "  abc123  \n";
		}) as never);

		expect(sourceCommit).toBe("abc123");
		expect(calls).toEqual([
			[
				"git",
				["-c", `safe.directory=${repositoryDirectory.replaceAll("\\", "/")}`, "rev-parse", "HEAD"],
				{ cwd: repositoryDirectory, encoding: "utf8" },
			],
		]);
		expect(JSON.stringify(calls)).not.toContain("safe.directory=*");
		expect(JSON.stringify(calls)).not.toContain("config --global");
	});

	it("propagates provenance resolution failure before a durable attempt can begin", () => {
		const repositoryDirectory = resolve(process.cwd(), "workspace", "customer-support-agent");
		expect(() =>
			resolveSourceCommit(repositoryDirectory, (() => {
				throw new Error("Git provenance unavailable");
			}) as never),
		).toThrow("Git provenance unavailable");
	});
});
