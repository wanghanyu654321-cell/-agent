import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function productFiles(directory: string): string[] {
	return readdirSync(directory).flatMap((entry) => {
		const path = join(directory, entry);
		return statSync(path).isDirectory() ? productFiles(path) : [path];
	});
}

describe("independent repository extraction", () => {
	it("pins the required public Pi packages without workspace dependencies", () => {
		const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
			dependencies: Record<string, string>;
		};
		const requiredPackages = [
			"@earendil-works/pi-agent-core",
			"@earendil-works/pi-ai",
			"@earendil-works/pi-coding-agent",
		] as const;

		for (const name of requiredPackages) {
			expect(packageJson.dependencies[name]).toBe("0.84.3");
		}
		for (const version of Object.values(packageJson.dependencies)) {
			expect(version).not.toMatch(/^(workspace:|git\+|github:|\^|~)/);
		}
	});

	it("resolves Pi runtime packages from this repository installation", () => {
		for (const name of [
			"@earendil-works/pi-agent-core",
			"@earendil-works/pi-ai",
			"@earendil-works/pi-coding-agent",
		]) {
			const packageRoot = join(root, "node_modules", ...name.split("/"));
			const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
				exports: { ".": { import: string } };
			};
			const resolved = join(packageRoot, manifest.exports["."].import);
			expect(existsSync(resolved)).toBe(true);
			expect(relative(root, resolved).startsWith("node_modules")).toBe(true);
		}
	});

	it("contains no runtime path into the former Pi monorepo", () => {
		const forbidden = [/\.\.\/\.\.\/packages\//, /coding-agent\/src\//, /pi-source/, /workspace:\*/];
		for (const file of [
			...productFiles(join(root, "src")),
			join(root, "tsconfig.json"),
			join(root, "vitest.config.ts"),
		]) {
			const content = readFileSync(file, "utf8");
			for (const expression of forbidden) {
				expect(content).not.toMatch(expression);
			}
		}
	});

	it("does not vendor Pi Agent, SessionManager, model, or generic tool source", () => {
		const sourceFiles = productFiles(join(root, "src")).map((file) => relative(join(root, "src"), file));
		expect(sourceFiles).toEqual(["index.ts"]);
		for (const forbiddenPath of ["packages/agent", "packages/coding-agent", "packages/ai", "packages/tui"]) {
			expect(existsSync(join(root, forbiddenPath))).toBe(false);
		}
	});
});
