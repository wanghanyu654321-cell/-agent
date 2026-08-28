import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTED_TAG_PEELS = {
	"customer-support-agent-runtime-v0": "72eadc11a47e4176887607a310e74c242d4a261a",
	"customer-support-agent-v1-safety": "9c60fe9a0764bd22a595d13a463b5665899d7c35",
	"customer-support-agent-v1.1-robustness": "16fbf073f096e8eda443ddcad79e3666aec5ec09",
	"customer-support-agent-v1.2-validation": "932cdf5543f996c63157c00750cdb597d0f547bd",
	"customer-support-agent-v2.0-knowledge": "98cca9b92c13c2639beb958177923b3c09b42ed9",
	"customer-support-agent-v2.0.1-faq-admission": "f8a5498ddae424246a9e32fcc430d186573d9d55",
};

const PI_PACKAGES = [
	"@earendil-works/pi-agent-core",
	"@earendil-works/pi-ai",
	"@earendil-works/pi-coding-agent",
];

export function verifyPiDependencies(dependencies) {
	return PI_PACKAGES.flatMap((name) =>
		dependencies[name] === "0.84.3" ? [] : [`${name} must be exactly 0.84.3; found ${dependencies[name] ?? "missing"}.`],
	);
}

export function verifyTagPeels(actualPeels) {
	return Object.entries(EXPECTED_TAG_PEELS).flatMap(([tag, expected]) =>
		actualPeels[tag] === expected ? [] : [`${tag} must peel to ${expected}; found ${actualPeels[tag] ?? "missing"}.`],
	);
}

function readFiles(directory) {
	const ignored = new Set([".git", "node_modules", "dist"]);
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		if (ignored.has(entry.name)) return [];
		const path = join(directory, entry.name);
		return entry.isDirectory() ? readFiles(path) : [path];
	});
}

function verifyArchitecture(root) {
	const files = readFiles(join(root, "src"));
	const content = files.map((path) => ({ path: relative(root, path).replaceAll("\\", "/"), text: readFileSync(path, "utf8") }));
	const failures = [];
	const runtimeCount = content.reduce((total, file) => total + (file.text.match(/class SupportAgentRuntime/g)?.length ?? 0), 0);
	if (runtimeCount !== 1) failures.push(`Expected one SupportAgentRuntime; found ${runtimeCount}.`);
	const agentConstructorFiles = content.filter((file) => file.text.includes("new Agent("));
	if (agentConstructorFiles.some((file) => file.path !== "src/index.ts")) {
		failures.push("Pi Agent construction is outside src/index.ts.");
	}
	const forbiddenTool = /name:\s*["'](?:write_file|edit_file|update_knowledge|write_knowledge|shell|bash)["']/;
	if (content.some((file) => forbiddenTool.test(file.text))) {
		failures.push("Customer-facing filesystem, shell, or knowledge-writing tool detected.");
	}
	const vendoredPi = content.some((file) => /class SessionManager|class Agent\b|class ToolRegistry/.test(file.text));
	if (vendoredPi) failures.push("Vendored Pi core implementation detected under src.");
	return failures;
}

export function runIntegrityChecks(root = process.cwd()) {
	const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
	const failures = [...verifyPiDependencies(packageJson.dependencies ?? {}), ...verifyArchitecture(root)];
	const actualPeels = Object.fromEntries(
		Object.keys(EXPECTED_TAG_PEELS).map((tag) => [
			tag,
			execFileSync("git", ["rev-parse", `${tag}^{}`], { cwd: root, encoding: "utf8" }).trim(),
		]),
	);
	return [...failures, ...verifyTagPeels(actualPeels)];
}

function main() {
	const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
	const failures = runIntegrityChecks(root);
	if (failures.length === 0) {
		console.log("Integrity gate passed: tags, Pi pins, runtime boundary, and customer-tool boundary are intact.");
		return;
	}
	for (const failure of failures) console.error(`INTEGRITY FAILURE: ${failure}`);
	process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
