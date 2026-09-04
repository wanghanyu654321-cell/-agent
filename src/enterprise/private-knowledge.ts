import type { FaqEntry } from "../index.ts";
import type { KnowledgeEntry } from "../knowledge.ts";
import { loadPrivateKnowledgeCorpus } from "../private-corpus.ts";

export interface PrivateStoreKnowledgeComposition {
	faq: FaqEntry[];
	knowledge: KnowledgeEntry[];
	tenantId: string;
	storeId: string;
	allowSyntheticTestFixtures: false;
	allowSyntheticTestKnowledge: false;
}

/**
 * Admits one explicitly scoped, approved private corpus for the opt-in Pilot
 * path. Generic filesystem loading remains reusable for other callers; this
 * boundary deliberately applies the stricter Pilot contract before a runtime
 * can be composed.
 */
export function loadPrivateStoreKnowledgeComposition(
	environment: NodeJS.ProcessEnv = process.env,
): PrivateStoreKnowledgeComposition {
	const entries = loadPrivateKnowledgeCorpus(environment);
	if (entries.length === 0) throw new Error("A private knowledge corpus must contain at least one approved entry.");

	const scopes = new Set<string>();
	for (const entry of entries) {
		if (entry.status !== "approved") {
			throw new Error(`Private knowledge entry ${entry.id} must have status approved.`);
		}
		if (!entry.tenantScope || !entry.storeScope) {
			throw new Error(`Private knowledge entry ${entry.id} must declare tenantScope and storeScope.`);
		}
		scopes.add(`${entry.tenantScope}\u0000${entry.storeScope}`);
	}
	if (scopes.size !== 1) throw new Error("A private knowledge corpus must contain exactly one tenant/store scope.");

	const [tenantId, storeId] = [...scopes][0].split("\u0000");
	return {
		faq: entries.filter((entry) => entry.kind === "faq").map(toFaqEntry),
		knowledge: entries.filter((entry) => entry.kind !== "faq"),
		tenantId,
		storeId,
		allowSyntheticTestFixtures: false,
		allowSyntheticTestKnowledge: false,
	};
}

function toFaqEntry(entry: KnowledgeEntry): FaqEntry {
	return {
		id: entry.id,
		question: entry.title,
		answer: entry.content,
		status: entry.status,
		version: entry.version,
		sourceRef: entry.sourceRef,
		tenantScope: entry.tenantScope,
		storeScope: entry.storeScope,
	};
}
