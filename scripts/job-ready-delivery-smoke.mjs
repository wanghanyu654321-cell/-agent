#!/usr/bin/env node
// Job-Ready authenticated delivery smoke helper — ISOLATED Track D support file.
//
// Reads EVERY target and credential value from the environment and contains NO
// hardcoded secrets. Any missing prerequisite is reported as BLOCKED (exit 2),
// never PASS. This is a support helper for a reproducible health/smoke path per
// the deployment directive; Final Integration owns real deployment wiring and
// the existing Docker restart-persistence smoke.
//
// It deliberately asserts only contract-stable, non-invented properties:
// liveness, an authenticated identity within the expected tenant/store scope,
// and the absence of raw payload/provider/session leakage in responses.

const baseUrl = process.env.JOB_READY_BASE_URL;
const email = process.env.JOB_READY_SMOKE_EMAIL;
const password = process.env.JOB_READY_SMOKE_PASSWORD;
const expectedTenant = process.env.JOB_READY_SMOKE_EXPECT_TENANT;
const expectedStore = process.env.JOB_READY_SMOKE_EXPECT_STORE;
const conversationId = process.env.JOB_READY_SMOKE_CONVERSATION_ID ?? "job-ready-delivery-smoke";
const promptText = process.env.JOB_READY_SMOKE_PROMPT; // optional; no default prompt is invented
const timeoutMs = Number(process.env.JOB_READY_HEALTH_TIMEOUT_MS ?? "60000");

function blocked(reason) {
	console.error(`job-ready-delivery-smoke: BLOCKED - ${reason}`);
	process.exit(2);
}

function assert(condition, message) {
	if (!condition) blocked(message);
}

if (!baseUrl) blocked("JOB_READY_BASE_URL is not set");
if (!email) blocked("JOB_READY_SMOKE_EMAIL is not set");
if (!password) blocked("JOB_READY_SMOKE_PASSWORD is not set");
if (!expectedTenant) blocked("JOB_READY_SMOKE_EXPECT_TENANT is not set");
if (!expectedStore) blocked("JOB_READY_SMOKE_EXPECT_STORE is not set");

async function request(path, options = {}) {
	return fetch(new URL(path, baseUrl), options);
}

async function readJson(response, description) {
	const body = await response.json().catch(() => null);
	assert(response.ok, `${description} failed with HTTP ${response.status}`);
	return body;
}

async function waitForHealthy() {
	const deadline = Date.now() + timeoutMs;
	let last = "no attempt made";
	while (Date.now() < deadline) {
		try {
			const response = await request("/healthz");
			if (response.ok) return;
			last = `HTTP ${response.status}`;
		} catch (error) {
			last = error instanceof Error ? error.message : String(error);
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	blocked(`application did not become healthy: ${last}`);
}

async function login() {
	const response = await request("/api/v1/auth/login", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ email, password }),
	});
	await readJson(response, "login");
	const setCookie = response.headers.get("set-cookie");
	assert(setCookie, "login did not return a session cookie");
	return setCookie.split(";", 1)[0];
}

async function authenticatedJson(path, cookie, options, description) {
	const response = await request(path, {
		...options,
		headers: { ...(options?.headers ?? {}), cookie },
	});
	return readJson(response, description);
}

function assertNoRawLeak(body, description) {
	assert(body !== null && typeof body === "object", `${description} did not return an object`);
	for (const forbidden of ["payload", "sessionEvents", "provider", "reasoning"]) {
		assert(!(forbidden in body), `${description} must not expose ${forbidden}`);
	}
}

await waitForHealthy();
console.log("healthz: HTTP 200");

const cookie = await login();
const me = await authenticatedJson("/api/v1/auth/me", cookie, undefined, "auth/me");
assert(me?.actor?.role, "auth/me did not return an actor role");
assert(me?.scope?.tenantId === expectedTenant, `auth/me tenant is not the expected scope ${expectedTenant}`);
assert(me?.scope?.storeId === expectedStore, `auth/me store is not the expected scope ${expectedStore}`);
console.log(`auth/me: role=${me.actor.role} scope=${me.scope.tenantId}/${me.scope.storeId}`);

if (promptText) {
	const result = await authenticatedJson(
		"/api/v1/support/respond",
		cookie,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ conversationId, customerId: "job-ready-smoke-customer", text: promptText }),
		},
		"support/respond",
	);
	assert(typeof result?.type === "string" && result.type.length > 0, "support/respond did not return a result type");
	assertNoRawLeak(result, "support/respond");
	console.log(`support/respond: type=${result.type} evidenceCount=${Array.isArray(result.evidence) ? result.evidence.length : 0}`);
} else {
	console.log("support/respond: skipped (JOB_READY_SMOKE_PROMPT not set)");
}

console.log("job-ready-delivery-smoke: PASS");
