import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildBenchmarkContractAuditV2 } from "./benchmark-contract-audit-v2.ts";

const path = join(import.meta.dirname, "reports", "benchmark-contract-audit-v2.json");
mkdirSync(join(import.meta.dirname, "reports"), { recursive: true });
writeFileSync(path, `${JSON.stringify(buildBenchmarkContractAuditV2(), null, 2)}\n`, { encoding: "utf8", flag: "wx" });
console.log(path);
