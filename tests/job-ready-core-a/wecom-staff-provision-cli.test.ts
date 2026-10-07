import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it.each([
	{ args: [] },
	{ args: ["--corp-id", "fixture", "--agent-id", "100002", "--user-id", "@all", "--membership-id", "fixture"] },
	{
		args: [
			"--corp-id",
			"fixture",
			"--corp-id",
			"other",
			"--agent-id",
			"100002",
			"--user-id",
			"staff",
			"--membership-id",
			"fixture",
		],
	},
])("CLI rejects missing, broadcast or duplicate operator values before connecting", async ({ args }) => {
	try {
		await promisify(execFile)(
			process.execPath,
			["--no-warnings", "--experimental-transform-types", "scripts/provision-wecom-staff.ts", ...args],
			{
				env: { ...process.env, DATABASE_URL: "postgresql://invalid.invalid/unused" },
			},
		);
		throw new Error("invalid args must fail");
	} catch (error: any) {
		expect(error.code).toBe(1);
		expect(JSON.parse(error.stderr)).toEqual({ error: "invalid_request" });
	}
});
