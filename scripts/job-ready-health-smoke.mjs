#!/usr/bin/env node
// Job-Ready health / readiness smoke helper — ISOLATED Track D support file.
//
// Scope: unauthenticated liveness probe only. Reads its target from the
// environment and contains NO secrets. A missing environment or an unreachable
// target is reported as BLOCKED (exit 2), never PASS, per the Job-Ready
// directive: "Missing DB or external environment is BLOCKED, not PASS."
//
// This helper does not edit or replace the existing deterministic Docker
// persistence smoke (scripts/docker-delivery-smoke.mjs); Final Integration owns
// real deployment wiring.

const baseUrl = process.env.JOB_READY_BASE_URL;
const timeoutMs = Number(process.env.JOB_READY_HEALTH_TIMEOUT_MS ?? "60000");
const intervalMs = Number(process.env.JOB_READY_HEALTH_INTERVAL_MS ?? "500");

function blocked(reason) {
	console.error(`job-ready-health-smoke: BLOCKED - ${reason}`);
	process.exit(2);
}

if (!baseUrl) blocked("JOB_READY_BASE_URL is not set");
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) blocked("JOB_READY_HEALTH_TIMEOUT_MS must be a positive number");
if (!Number.isFinite(intervalMs) || intervalMs <= 0) blocked("JOB_READY_HEALTH_INTERVAL_MS must be a positive number");

async function probe(path) {
	const response = await fetch(new URL(path, baseUrl));
	return { status: response.status, ok: response.ok };
}

async function waitForHealthy() {
	const deadline = Date.now() + timeoutMs;
	let last = "no attempt made";
	while (Date.now() < deadline) {
		try {
			const { status, ok } = await probe("/healthz");
			if (ok) return status;
			last = `HTTP ${status}`;
		} catch (error) {
			last = error instanceof Error ? error.message : String(error);
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
	blocked(`application did not become healthy: ${last}`);
}

const healthStatus = await waitForHealthy();
console.log(`healthz: HTTP ${healthStatus}`);

// Readiness is optional and deployment-specific; report it but never require it.
try {
	const { status } = await probe("/readyz");
	console.log(`readyz: HTTP ${status}${status === 404 ? " (route absent - not required)" : ""}`);
} catch (error) {
	console.log(`readyz: probe skipped (${error instanceof Error ? error.message : String(error)})`);
}

console.log("job-ready-health-smoke: PASS");
