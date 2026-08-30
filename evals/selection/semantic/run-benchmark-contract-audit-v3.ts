import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildBenchmarkContractAuditV3, joinRecovery2Diagnostics } from "./benchmark-contract-audit-v3.ts";

const path = join(import.meta.dirname, "reports", "benchmark-contract-audit-v3.json");
mkdirSync(join(import.meta.dirname, "reports"), { recursive: true });
writeFileSync(
	path,
	`${JSON.stringify({ ...buildBenchmarkContractAuditV3(), recovery2Diagnostics: joinRecovery2Diagnostics() }, null, 2)}\n`,
	{ encoding: "utf8", flag: "wx" },
);
console.log(path);
