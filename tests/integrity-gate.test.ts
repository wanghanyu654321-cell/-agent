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

	it("requires the immutable V0 through V2.1 tag peels", () => {
		expect(EXPECTED_TAG_PEELS).toEqual({
			"customer-support-agent-runtime-v0": "72eadc11a47e4176887607a310e74c242d4a261a",
			"customer-support-agent-v1-safety": "9c60fe9a0764bd22a595d13a463b5665899d7c35",
			"customer-support-agent-v1.1-robustness": "16fbf073f096e8eda443ddcad79e3666aec5ec09",
			"customer-support-agent-v1.2-validation": "932cdf5543f996c63157c00750cdb597d0f547bd",
			"customer-support-agent-v2.0-knowledge": "98cca9b92c13c2639beb958177923b3c09b42ed9",
			"customer-support-agent-v2.0.1-faq-admission": "f8a5498ddae424246a9e32fcc430d186573d9d55",
			"customer-support-agent-v2.1-public-retrieval": "9a7872004399ad55b8bd5dbeaffc073b68f0c641",
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
			"fix/v2.0.1-faq-admission",
			"feat/v2.1-real-knowledge-retrieval",
			"fix/v2.1.1-eval-integrity",
			"npm ci --ignore-scripts",
			"npm test",
			"npm run build",
			"npm run check",
			"npm run eval:safety",
			"npm run eval:safety:robustness",
			"npm run eval:safety:holdout",
			"npm run eval:knowledge",
			"npm run eval:retrieval:public",
			"npm run eval:retrieval:public-real",
			"node scripts/verify-integrity.mjs",
		]) {
			expect(workflow).toContain(required);
		}
		expect(workflow).not.toContain("continue-on-error: true");
	});
});
