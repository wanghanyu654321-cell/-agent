import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildBenchmarkContractAudit } from "./benchmark-contract-audit.ts";

const reportPath = join(import.meta.dirname, "reports", "benchmark-contract-audit.json");
mkdirSync(join(import.meta.dirname, "reports"), { recursive: true });
writeFileSync(
	reportPath,
	`${JSON.stringify({ kind: "V2_3_BENCHMARK_CONTRACT_AUDIT", ...buildBenchmarkContractAudit() }, null, 2)}\n`,
	{ encoding: "utf8", flag: "wx" },
);
console.log(reportPath);
