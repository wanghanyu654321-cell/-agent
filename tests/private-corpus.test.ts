import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadPrivateKnowledgeCorpus, privateKnowledgeDirectoryFromEnvironment } from "../src/private-corpus.ts";

const directories: string[] = [];

afterEach(() => {
	for (const directory of directories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("V2.1 private corpus boundary", () => {
	it("requires an explicit private corpus directory instead of scanning repository knowledge", () => {
		expect(privateKnowledgeDirectoryFromEnvironment({})).toBeUndefined();
		expect(() => loadPrivateKnowledgeCorpus({})).toThrow("SUPPORT_AGENT_PRIVATE_KNOWLEDGE_DIR is required");
	});

	it("loads governed entries only from the explicitly supplied private directory", () => {
		const directory = mkdtempSync(join(tmpdir(), "support-private-corpus-"));
		directories.push(directory);
		writeFileSync(
			join(directory, "approved.json"),
			JSON.stringify({
				id: "private-controlled-entry",
				kind: "policy",
				status: "approved",
				title: "PRIVATE_CONTROLLED_TITLE",
				content: "PRIVATE_CONTROLLED_CONTENT",
				version: "private-v1",
				updatedAt: "2026-08-28",
				sourceRef: "private://controlled-source",
				tags: ["controlled"],
			}),
		);

		expect(
			loadPrivateKnowledgeCorpus({ SUPPORT_AGENT_PRIVATE_KNOWLEDGE_DIR: directory }).map((entry) => entry.id),
		).toEqual(["private-controlled-entry"]);
	});
});
