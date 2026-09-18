import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { formatPiRealProviderSmokeBlockedOutput } from "../scripts/pi-real-provider-smoke.ts";

const execFileAsync = promisify(execFile);

describe("Pi real-provider smoke blocked output", () => {
	it("emits only a bounded configuration category instead of the internal failure text", async () => {
		const error = await execFileAsync(
			process.execPath,
			["--experimental-transform-types", "scripts/pi-real-provider-smoke.ts"],
			{
				cwd: process.cwd(),
				env: {
					...process.env,
					ENTERPRISE_RUNTIME_MODE: "unsupported-mode",
					NODE_NO_WARNINGS: "1",
				},
			},
		).then(
			() => ({ code: 0, stderr: "" }),
			(caught: unknown) => caught as { code?: number; stderr?: string },
		);

		expect(error.code).toBe(1);
		expect(error.stderr).toContain("REAL_PROVIDER_SMOKE_BLOCKED CONFIGURATION_INVALID");
		expect(error.stderr).not.toContain("ENTERPRISE_RUNTIME_MODE must be deterministic or pi-real.");
	});

	it("maps Pi startup branches and unknown execution errors to non-sensitive blocked categories", () => {
		expect(formatPiRealProviderSmokeBlockedOutput(new Error("Pi provider authentication is not configured."))).toBe(
			"REAL_PROVIDER_SMOKE_BLOCKED AUTH_UNAVAILABLE",
		);
		expect(formatPiRealProviderSmokeBlockedOutput(new Error("Pi provider/model is unavailable."))).toBe(
			"REAL_PROVIDER_SMOKE_BLOCKED MODEL_UNAVAILABLE",
		);
		expect(formatPiRealProviderSmokeBlockedOutput(new Error("Pi provider initialization failed."))).toBe(
			"REAL_PROVIDER_SMOKE_BLOCKED INITIALIZATION_UNAVAILABLE",
		);

		const rawUpstreamError = "raw-provider-cause";
		const output = formatPiRealProviderSmokeBlockedOutput(new Error(rawUpstreamError));
		expect(output).toBe("REAL_PROVIDER_SMOKE_BLOCKED EXECUTION_UNAVAILABLE");
		expect(output).not.toContain(rawUpstreamError);
	});
});
