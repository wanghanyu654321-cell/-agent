import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { KnowledgeEntry } from "../knowledge.ts";

export const PILOT_REAL_SOURCE_ENTRY_IDS = [
	"PB-MT-VOUCHER-USE",
	"PB-MT-CHANGE-REFUND",
	"PB-MT-MERCHANT-CANNOT-FULFILL",
	"PB-MT-AFTERSALES-CONTACT",
	"PB-MT-REFUND-ORIGINAL-PAYMENT",
	"PB-MT-UNCONSUMED-REFUND",
	"PB-MT-EXPIRED-AUTO-REFUND",
	"PB-DP-HELP-UNVERIFIED",
] as const;

export const PILOT_REAL_SOURCE_SCOPE = {
	tenantId: "pilot-support-tenant",
	storeId: "pilot-support-store",
} as const;

export const PILOT_REAL_SOURCE_PACK_FILE = "pilot-real-source-knowledge-v1.json";

/**
 * Selects only the review-approved public official facts and assigns the
 * opaque portfolio scope required by the existing private-corpus boundary.
 */
export function selectPilotRealSourceKnowledgePack(sourceEntries: KnowledgeEntry[]): KnowledgeEntry[] {
	const sourceById = new Map(sourceEntries.map((entry) => [entry.id, entry]));
	return PILOT_REAL_SOURCE_ENTRY_IDS.map((id) => {
		const entry = sourceById.get(id);
		if (!entry || entry.status !== "approved") {
			throw new Error(`Approved public source entry ${id} is required for the Pilot pack.`);
		}
		return {
			...entry,
			tags: [...entry.tags],
			tenantScope: PILOT_REAL_SOURCE_SCOPE.tenantId,
			storeScope: PILOT_REAL_SOURCE_SCOPE.storeId,
		};
	});
}

/**
 * Creates a reviewable scoped copy for an operator-provided private directory.
 * The write-once file prevents silently replacing an operator's existing pack.
 */
export function materializePilotRealSourceKnowledgePack(
	sourceEntries: KnowledgeEntry[],
	directory: string,
): KnowledgeEntry[] {
	const entries = selectPilotRealSourceKnowledgePack(sourceEntries);
	mkdirSync(directory, { recursive: true });
	writeFileSync(join(directory, PILOT_REAL_SOURCE_PACK_FILE), JSON.stringify(entries, null, 2), {
		encoding: "utf8",
		flag: "wx",
	});
	return entries;
}
