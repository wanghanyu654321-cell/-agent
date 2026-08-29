import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runPublicBenchmarkEvaluation, runPublicBenchmarkRuntimeEvaluation } from "./public-benchmark.ts";

const reportsDirectory = join(import.meta.dirname, "reports");
mkdirSync(reportsDirectory, { recursive: true });
const retrieval = await runPublicBenchmarkEvaluation();
const runtime = await runPublicBenchmarkRuntimeEvaluation();
const firstRunPath = join(reportsDirectory, "first-run.json");
if (!existsSync(firstRunPath)) writeFileSync(firstRunPath, `${JSON.stringify(retrieval.first, null, 2)}\n`);
writeFileSync(
	join(reportsDirectory, "public-real-world-final.json"),
	`${JSON.stringify({ retrieval, runtime }, null, 2)}\n`,
);
console.log(
	JSON.stringify(
		{
			first: retrieval.first.metrics,
			final: retrieval.final.metrics,
			runtime: runtime.metrics,
			gatePassed: retrieval.final.gatePassed && runtime.gatePassed,
		},
		null,
		2,
	),
);
