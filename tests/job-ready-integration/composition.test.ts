import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { enterpriseRetrievalModeFromEnv } from "../../src/enterprise/application.ts";
import { applyJobReadyMigrations } from "../../src/enterprise/postgres.ts";

describe("Job-Ready shared composition", () => {
	it("registers exactly 001 through 006 once, preserving the existing transaction ledger", async () => {
		const ledger = new Set<string>();
		const statements: string[] = [];
		const release = vi.fn();
		const client = {
			release,
			query: vi.fn(async (sql: string, values?: string[]) => {
				statements.push(sql);
				if (sql.startsWith("SELECT id FROM")) return { rowCount: ledger.has(values![0]) ? 1 : 0 };
				if (sql.startsWith("INSERT INTO enterprise_schema_migrations")) ledger.add(values![0]);
				return { rowCount: 0 };
			}),
		};
		const pool = { connect: async () => client } as unknown as Pool;
		await applyJobReadyMigrations(pool);
		await applyJobReadyMigrations(pool);
		expect([...ledger]).toEqual([
			"001_enterprise_identity",
			"002_support_business_persistence",
			"003_job_ready_storeops",
			"004_job_ready_rag",
			"005_job_ready_rag_profiles",
			"006_wecom_customer_identity",
		]);
		expect(statements.filter((sql) => sql.includes("CREATE TABLE rag_documents"))).toHaveLength(1);
		expect(statements.filter((sql) => sql === "BEGIN")).toHaveLength(12);
		expect(statements.filter((sql) => sql === "COMMIT")).toHaveLength(12);
		expect(release).toHaveBeenCalledTimes(2);
	});
	it("defaults to lexical and accepts only explicitly named retrieval modes", () => {
		expect(enterpriseRetrievalModeFromEnv({})).toBe("lexical");
		expect(() => enterpriseRetrievalModeFromEnv({ ENTERPRISE_RETRIEVAL_MODE: "auto" })).toThrow();
		expect(enterpriseRetrievalModeFromEnv({ ENTERPRISE_RETRIEVAL_MODE: "vector" })).toBe("vector");
	});
});
