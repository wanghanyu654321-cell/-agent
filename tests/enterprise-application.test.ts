import { describe, expect, it } from "vitest";
import { enterpriseApplicationConfigFromEnv } from "../src/enterprise/application.ts";
import { seedPortfolioEnterpriseDemoData } from "../src/enterprise/demo-data.ts";
import { InMemoryIdentityRepository } from "../src/enterprise/identity.ts";

describe("enterprise application configuration", () => {
	it("requires DATABASE_URL and rejects an invalid configured port", () => {
		expect(() => enterpriseApplicationConfigFromEnv({})).toThrow("DATABASE_URL is required");
		expect(() => enterpriseApplicationConfigFromEnv({ DATABASE_URL: "postgres://demo", PORT: "invalid" })).toThrow(
			"PORT must be a valid TCP port",
		);
	});

	it("uses explicit PostgreSQL configuration without production defaults", () => {
		expect(
			enterpriseApplicationConfigFromEnv({
				DATABASE_URL: "postgres://application-test",
				PORT: "4312",
			}),
		).toEqual({ databaseUrl: "postgres://application-test", host: "127.0.0.1", port: 4312 });
	});

	it("keeps the complete synthetic portfolio seed repeat-safe", async () => {
		const repository = new InMemoryIdentityRepository();
		const first = await seedPortfolioEnterpriseDemoData(repository, new Date("2026-09-01T00:00:00.000Z"));
		const second = await seedPortfolioEnterpriseDemoData(repository, new Date("2026-09-02T00:00:00.000Z"));

		expect(second.users).toEqual(first.users);
		await expect(repository.listMembershipsForUser(first.users.alice.id)).resolves.toHaveLength(1);
		await expect(repository.listMembershipsForUser(first.users.susan.id)).resolves.toHaveLength(1);
		await expect(repository.listMembershipsForUser(first.users.bob.id)).resolves.toHaveLength(1);
	});
});
