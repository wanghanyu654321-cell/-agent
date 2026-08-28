import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EXPECTED_TAG_PEELS, verifyPiDependencies, verifyTagPeels } from "../scripts/verify-integrity.mjs";

const root = resolve(import.meta.dirname, "..");

describe("V1.2 independent integrity gate", () => {
	it("accepts only the three exact pinned Pi dependencies", () => {
		expect(
			verifyPiDependencies({
				"@earendil-works/pi-agent-core": "0.84.3",
				"@earendil-works/pi-ai": "0.84.3",
				"@earendil-works/pi-coding-agent": "0.84.3",
			}),
		).toEqual([]);
		expect(
			verifyPiDependencies({
				"@earendil-works/pi-agent-core": "latest",
				"@earendil-works/pi-ai": "^0.84.3",
				"@earendil-works/pi-coding-agent": "workspace:*",
			}),
		).toHaveLength(3);
	});

	it("requires the immutable V0, V1, V1.1, and V1.2 tag peels", () => {
		expect(EXPECTED_TAG_PEELS).toEqual({
			"customer-support-agent-runtime-v0": "72eadc11a47e4176887607a310e74c242d4a261a",
			"customer-support-agent-v1-safety": "9c60fe9a0764bd22a595d13a463b5665899d7c35",
			"customer-support-agent-v1.1-robustness": "16fbf073f096e8eda443ddcad79e3666aec5ec09",
			"customer-support-agent-v1.2-validation": "932cdf5543f996c63157c00750cdb597d0f547bd",
		});
		expect(verifyTagPeels({ ...EXPECTED_TAG_PEELS })).toEqual([]);
		expect(verifyTagPeels({ ...EXPECTED_TAG_PEELS, "customer-support-agent-v1-safety": "wrong" })).toHaveLength(1);
	});

	it("runs the integrity script against the real repository", () => {
		expect(() => execFileSync(process.execPath, ["scripts/verify-integrity.mjs"], { cwd: root })).not.toThrow();
	});

	it("defines a clean-runner workflow with every required gate command", () => {
		const workflow = readFileSync(resolve(root, ".github/workflows/customer-support-agent-gate.yml"), "utf8");
		for (const required of [
			"pull_request:",
			"feat/v1.2-blind-eval-ci",
			"feat/v2.0-knowledge-grounding",
			"npm ci --ignore-scripts",
			"npm test",
			"npm run build",
			"npm run check",
			"npm run eval:safety",
			"npm run eval:safety:robustness",
			"npm run eval:safety:holdout",
			"npm run eval:knowledge",
			"node scripts/verify-integrity.mjs",
		]) {
			expect(workflow).toContain(required);
		}
		expect(workflow).not.toContain("continue-on-error: true");
	});
});
