import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(new URL("../migrations/002_support_business_persistence.sql", import.meta.url));

describe("support business persistence migration", () => {
	it("adds scoped conversation foreign keys and replaces the global handoff uniqueness rule", () => {
		const sql = readFileSync(migrationPath, "utf8");

		expect(sql).toContain("ADD CONSTRAINT tickets_conversation_scope_fkey");
		expect(sql).toContain("ADD CONSTRAINT handoffs_conversation_scope_fkey");
		expect(sql).toContain("ADD CONSTRAINT audit_events_conversation_scope_fkey");
		expect(sql).toContain("UNIQUE (tenant_id, store_id, conversation_id)");
		expect(sql).toContain("DROP CONSTRAINT IF EXISTS handoffs_conversation_id_key");
	});
});
