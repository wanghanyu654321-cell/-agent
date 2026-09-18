import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { KnowledgeEntry } from "../src/knowledge.ts";
import { PRIVATE_KNOWLEDGE_DIRECTORY_ENV } from "../src/private-corpus.ts";
import {
	PILOT_REAL_SOURCE_ENTRY_IDS,
	PILOT_REAL_SOURCE_SCOPE,
	materializePilotRealSourceKnowledgePack,
} from "../src/enterprise/real-source-knowledge-pack.ts";

function sourceEntries(): KnowledgeEntry[] {
	const scriptDirectory = dirname(fileURLToPath(import.meta.url));
	const path = resolve(scriptDirectory, "../knowledge/public-benchmark/approved/meituan-local-services-2026.json");
	return JSON.parse(readFileSync(path, "utf8")) as KnowledgeEntry[];
}

function privateDirectory(): string {
	const directory = process.env[PRIVATE_KNOWLEDGE_DIRECTORY_ENV]?.trim();
	if (!directory) throw new Error("PRIVATE_DIRECTORY_REQUIRED");
	return directory;
}

try {
	materializePilotRealSourceKnowledgePack(sourceEntries(), privateDirectory());
	console.log(
		JSON.stringify({
			packId: "job-ready-real-source-knowledge-v1",
			entryIds: PILOT_REAL_SOURCE_ENTRY_IDS,
			tenantId: PILOT_REAL_SOURCE_SCOPE.tenantId,
			storeId: PILOT_REAL_SOURCE_SCOPE.storeId,
		}),
	);
} catch {
	console.error("REAL_SOURCE_PILOT_PACK_BLOCKED MATERIALIZATION_UNAVAILABLE");
	process.exitCode = 1;
}
