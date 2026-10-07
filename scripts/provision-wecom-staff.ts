import { parseArgs } from "node:util";
import { Pool } from "pg";
import { provisionStaffBinding } from "../src/channels/wecom/staff.ts";
import { boundedId, StoreOpsError } from "../src/storeops/contracts.ts";

let pool: Pool | undefined;
try {
	const { values, tokens } = parseArgs({
		options: {
			"corp-id": { type: "string" },
			"agent-id": { type: "string" },
			"user-id": { type: "string" },
			"membership-id": { type: "string" },
		},
		strict: true,
		allowPositionals: false,
		tokens: true,
	});
	const seen = new Set<string>();
	for (const token of tokens) {
		if (token.kind !== "option" || seen.has(token.name)) throw new StoreOpsError("invalid_request");
		seen.add(token.name);
	}
	const input = {
		corpId: values["corp-id"], agentId: values["agent-id"],
		userId: values["user-id"], membershipId: values["membership-id"],
	};
	for (const value of Object.values(input)) {
		boundedId(value);
		if (!value || value !== value.trim() || !value.isWellFormed() || /[\u0000-\u001f]/.test(value))
			throw new StoreOpsError("invalid_request");
	}
	if (!input.agentId || !/^[1-9]\d{0,9}$/.test(input.agentId) || !input.userId ||
		input.userId.length > 128 || input.userId.includes("|") || input.userId === "@all" || input.corpId!.length > 128)
		throw new StoreOpsError("invalid_request");
	if (!process.env.DATABASE_URL) throw new StoreOpsError("dependency_unavailable");
	pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
	const bindingId = await provisionStaffBinding(pool, {
		corpId: input.corpId!, agentId: input.agentId, userId: input.userId, membershipId: input.membershipId!,
	});
	console.log(JSON.stringify({ status: "provisioned", bindingId }));
} catch (error) {
	const category = error instanceof StoreOpsError ? error.code
		: error instanceof Error && "code" in error && String(error.code).startsWith("ERR_PARSE_ARGS")
			? "invalid_request" : "binding_provision_failed";
	console.error(JSON.stringify({ error: category }));
	process.exitCode = 1;
} finally {
	await pool?.end();
}
