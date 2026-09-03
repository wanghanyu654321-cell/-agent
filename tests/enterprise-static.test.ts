import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EnterpriseAuthService } from "../src/enterprise/auth.ts";
import { seedPortfolioEnterpriseDemoData } from "../src/enterprise/demo-data.ts";
import { createEnterpriseHttpServer } from "../src/enterprise/http-api.ts";
import { InMemoryIdentityRepository } from "../src/enterprise/identity.ts";

const servers: ReturnType<typeof createEnterpriseHttpServer>[] = [];
const temporaryRoots: string[] = [];

afterEach(async () => {
	while (servers.length > 0) {
		const server = servers.pop();
		if (server?.listening)
			await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
	}
	while (temporaryRoots.length > 0) await rm(temporaryRoots.pop()!, { recursive: true, force: true });
});

describe("enterprise same-origin static delivery", () => {
	it("serves the React index and built assets while preserving health and API precedence", async () => {
		const staticRoot = await staticFixture();
		const origin = await startServer(staticRoot);

		const index = await fetch(`${origin}/`);
		expect(index.status).toBe(200);
		expect(index.headers.get("content-type")).toContain("text/html");
		expect(await index.text()).toContain('<div id="root"></div>');

		const asset = await fetch(`${origin}/assets/app.js`);
		expect(asset.status).toBe(200);
		expect(asset.headers.get("content-type")).toContain("text/javascript");
		expect(await asset.text()).toContain("app-ready");

		const stylesheet = await fetch(`${origin}/assets/app.css`);
		expect(stylesheet.status).toBe(200);
		expect(stylesheet.headers.get("content-type")).toContain("text/css");

		const health = await fetch(`${origin}/healthz`);
		expect(health.headers.get("content-type")).toContain("application/json");
		expect(await health.json()).toEqual({ status: "ok" });

		const me = await fetch(`${origin}/api/v1/auth/me`);
		expect(me.status).toBe(401);
		expect(me.headers.get("content-type")).toContain("application/json");
		expect(await me.json()).toEqual({ error: "unauthenticated" });
	});

	it("keeps unknown API paths as API 404s and rejects static path traversal", async () => {
		const staticRoot = await staticFixture();
		const origin = await startServer(staticRoot);

		const apiMissing = await fetch(`${origin}/api/v1/not-a-browser-route`);
		expect(apiMissing.status).toBe(404);
		expect(apiMissing.headers.get("content-type")).toContain("application/json");
		expect(await apiMissing.json()).toEqual({ error: "not_found" });

		const traversal = await fetch(`${origin}/%2e%2e%2fsecret.txt`);
		expect(traversal.status).toBe(404);
		expect(await traversal.text()).not.toContain("outside-static-root");
	});
});

async function staticFixture(): Promise<string> {
	const outerRoot = await mkdtemp(join(tmpdir(), "support-agent-static-"));
	temporaryRoots.push(outerRoot);
	const root = join(outerRoot, "public");
	await mkdir(root);
	await writeFile(join(root, "index.html"), '<!doctype html><div id="root"></div>');
	await mkdir(join(root, "assets"));
	await writeFile(join(root, "assets", "app.js"), "console.log('app-ready');");
	await writeFile(join(root, "assets", "app.css"), "body { color: #172033; }");
	await writeFile(join(outerRoot, "secret.txt"), "outside-static-root");
	return root;
}

async function startServer(staticRoot: string): Promise<string> {
	const repository = new InMemoryIdentityRepository();
	await seedPortfolioEnterpriseDemoData(repository);
	const server = createEnterpriseHttpServer({ auth: new EnterpriseAuthService(repository), staticRoot });
	servers.push(server);
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address() as AddressInfo;
	return `http://127.0.0.1:${address.port}`;
}
