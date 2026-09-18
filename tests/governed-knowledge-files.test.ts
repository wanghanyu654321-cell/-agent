import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadKnowledgeEntriesFromDirectory } from "../src/knowledge.ts";

describe("governed knowledge file repository", () => {
	it("loads structured entries and validates the complete repository before use", () => {
		const directory = mkdtempSync(join(tmpdir(), "governed-knowledge-files-"));
		try {
			writeFileSync(
				join(directory, "fixture.json"),
				JSON.stringify({
					id: "fixture-entry",
					kind: "faq",
					status: "synthetic_test_only",
					title: "受控夹具",
					content: "仅供测试的受控内容。",
					version: "fixture-v1",
					updatedAt: "2026-08-28",
					sourceRef: "test://fixture-entry",
					tags: ["受控"],
				}),
			);
			writeFileSync(join(directory, "duplicate.json"), "[]");

			expect(loadKnowledgeEntriesFromDirectory(directory)).toMatchObject([{ id: "fixture-entry" }]);

			writeFileSync(
				join(directory, "duplicate.json"),
				JSON.stringify({
					id: "fixture-entry",
					kind: "faq",
					status: "synthetic_test_only",
					title: "重复夹具",
					content: "仅供测试的重复内容。",
					version: "fixture-v1",
					updatedAt: "2026-08-28",
					sourceRef: "test://duplicate-entry",
					tags: ["受控"],
				}),
			);
			expect(() => loadKnowledgeEntriesFromDirectory(directory)).toThrow("duplicate id");
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("fails clearly when a structured file cannot be parsed as a knowledge entry", () => {
		const directory = mkdtempSync(join(tmpdir(), "governed-knowledge-malformed-"));
		try {
			writeFileSync(join(directory, "bad.json"), "not-json");
			expect(() => loadKnowledgeEntriesFromDirectory(directory)).toThrow("could not be parsed");
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
