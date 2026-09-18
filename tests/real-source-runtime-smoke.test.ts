import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	formatRealSourceRuntimeProofBlockedOutput,
	REAL_SOURCE_RUNTIME_PROOF_CASES,
	type RealSourceRuntimeProofDependencies,
	runRealSourceRuntimeProof,
} from "../scripts/real-source-runtime-smoke.ts";
import type { PiEnterpriseKnowledgeComposition } from "../src/enterprise/pi-runtime.ts";
import { PILOT_REAL_SOURCE_SCOPE } from "../src/enterprise/real-source-knowledge-pack.ts";
import type { SupportRequest, SupportResult } from "../src/index.ts";

const execFileAsync = promisify(execFile);
let proofDirectory: string;
beforeEach(() => {
	proofDirectory = mkdtempSync(join(tmpdir(), "runtime-proof-test-"));
});
afterEach(() => rmSync(proofDirectory, { recursive: true, force: true }));

const composition: PiEnterpriseKnowledgeComposition = {
	faq: [],
	knowledge: [],
	allowSyntheticTestFixtures: false,
	allowSyntheticTestKnowledge: false,
};

function successResult(caseId: string): SupportResult {
	const expected = REAL_SOURCE_RUNTIME_PROOF_CASES.find((item) => item.caseId === caseId)!;
	return {
		type: expected.expectedResultType,
		text: "MODEL_OR_RUNTIME_TEXT_MUST_NEVER_BE_PROJECTED",
		toolsCalled: expected.requiredToolsCalled,
		evidence: expected.expectedEvidenceIds.map((id) => ({ id })),
		sessionEvents: [{ type: "raw-event", secret: "not-safe-to-project" }],
	} as unknown as SupportResult;
}

function dependencies(
	results: SupportResult[] = REAL_SOURCE_RUNTIME_PROOF_CASES.map((item) => successResult(item.caseId)),
) {
	const run = vi.fn<(request: SupportRequest) => Promise<SupportResult>>(async () => results.shift() as SupportResult);
	const loadPrivateComposition = vi.fn<
		(environment: NodeJS.ProcessEnv) => PiEnterpriseKnowledgeComposition & {
			tenantId: string;
			storeId: string;
		}
	>(() => ({
		...composition,
		tenantId: PILOT_REAL_SOURCE_SCOPE.tenantId,
		storeId: PILOT_REAL_SOURCE_SCOPE.storeId,
	}));
	const close = vi.fn(async () => undefined);
	const createRuntimeFactory = vi.fn(() => () => ({ runtime: { run }, close }));
	const bootstrap = vi.fn(async () => ({ model: {} as never, streamFn: vi.fn() as never }));
	const sourceHead = vi.fn(() => "proof-source-head");
	return {
		dependencies: {
			sourceHead,
			loadPrivateComposition,
			bootstrap,
			createRuntimeFactory,
		} as unknown as RealSourceRuntimeProofDependencies,
		run,
		loadPrivateComposition,
		bootstrap,
		createRuntimeFactory,
		close,
	};
}

function environment(): NodeJS.ProcessEnv {
	return {
		ENTERPRISE_RUNTIME_MODE: "pi-real",
		ENTERPRISE_KNOWLEDGE_MODE: "private",
		PI_PROVIDER: "faux-provider",
		PI_MODEL: "faux-model",
		SUPPORT_AGENT_PRIVATE_KNOWLEDGE_DIR: "operator-private-directory",
		REAL_SOURCE_RUNTIME_PROOF_JOURNAL: join(proofDirectory, "proof.jsonl"),
	};
}

describe("real-source runtime smoke", () => {
	it("fails closed with a bounded category when explicit Pi runtime configuration is missing", async () => {
		const { dependencies: injected, bootstrap } = dependencies();

		await expect(runRealSourceRuntimeProof({}, injected)).rejects.toThrow("CONFIGURATION_UNAVAILABLE");
		expect(bootstrap).not.toHaveBeenCalled();
	});

	it("reuses the private composition boundary and rejects a non-approved opaque scope before Pi bootstrap", async () => {
		const { dependencies: injected, loadPrivateComposition, bootstrap } = dependencies();
		loadPrivateComposition.mockReturnValueOnce({
			...composition,
			tenantId: "another-tenant",
			storeId: "another-store",
		});

		await expect(runRealSourceRuntimeProof(environment(), injected)).rejects.toThrow("PRIVATE_KNOWLEDGE_UNAVAILABLE");
		expect(loadPrivateComposition).toHaveBeenCalledWith(environment());
		expect(bootstrap).not.toHaveBeenCalled();
	});

	it("runs only the three approved cases and projects safe metadata without result text or raw events", async () => {
		const { dependencies: injected, run, createRuntimeFactory, close } = dependencies();

		const summary = await runRealSourceRuntimeProof(environment(), injected);

		expect(createRuntimeFactory).toHaveBeenCalledOnce();
		expect(run).toHaveBeenCalledTimes(3);
		expect(run.mock.calls.map(([request]) => request.text)).toEqual(
			REAL_SOURCE_RUNTIME_PROOF_CASES.map((item) => item.query),
		);
		expect(run.mock.calls.map(([request]) => request.conversationId)).toEqual(
			REAL_SOURCE_RUNTIME_PROOF_CASES.map((item) => item.conversationId),
		);
		expect(run.mock.calls.every(([request]) => request.tenantId === PILOT_REAL_SOURCE_SCOPE.tenantId)).toBe(true);
		expect(run.mock.calls.every(([request]) => request.storeId === PILOT_REAL_SOURCE_SCOPE.storeId)).toBe(true);
		expect(summary.runtimeCaseAttempts).toBe(3);
		expect(summary.retries).toBe(0);
		expect(summary.allThreeCasesPassed).toBe(true);
		expect(summary.cases).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ caseId: "A_SINGLE_EVIDENCE", expectedVsActualPass: true }),
				expect.objectContaining({ caseId: "B_ZERO_EVIDENCE", expectedVsActualPass: true }),
				expect.objectContaining({ caseId: "C_AMBIGUOUS_EVIDENCE", expectedVsActualPass: true }),
			]),
		);
		const serialized = JSON.stringify(summary);
		expect(serialized).not.toContain("MODEL_OR_RUNTIME_TEXT_MUST_NEVER_BE_PROJECTED");
		expect(serialized).not.toContain("raw-event");
		expect(serialized).not.toContain("not-safe-to-project");
		expect(close).toHaveBeenCalledOnce();
	});

	it("accepts allowed read-only probes and a guarded handoff attempt without requiring an exact tool order", async () => {
		const cases = REAL_SOURCE_RUNTIME_PROOF_CASES.map((item) => successResult(item.caseId));
		cases[0] = {
			...successResult("A_SINGLE_EVIDENCE"),
			toolsCalled: ["search_faq", "search_knowledge"],
		} as SupportResult;
		cases[1] = {
			...successResult("B_ZERO_EVIDENCE"),
			toolsCalled: ["search_faq", "search_knowledge"],
		} as SupportResult;
		cases[2] = {
			...successResult("C_AMBIGUOUS_EVIDENCE"),
			toolsCalled: ["search_faq", "search_knowledge", "handoff_to_human"],
			sessionEvents: [
				{ type: "tool_execution_end", toolName: "handoff_to_human", isError: true },
			] as SupportResult["sessionEvents"],
		} as SupportResult;
		const { dependencies: injected } = dependencies(cases);

		const summary = await runRealSourceRuntimeProof(environment(), injected);

		expect(summary.allThreeCasesPassed).toBe(true);
		expect(summary.cases.map((item) => item.expectedVsActualPass)).toEqual([true, true, true]);
	});

	it("marks wrong result type, evidence, or a missing governed knowledge lookup as failed instead of hard-coding a pass", async () => {
		const cases = REAL_SOURCE_RUNTIME_PROOF_CASES.map((item) => successResult(item.caseId));
		cases[0] = { ...successResult("A_SINGLE_EVIDENCE"), type: "fallback" } as SupportResult;
		cases[1] = { ...successResult("B_ZERO_EVIDENCE"), evidence: [{ id: "unexpected-evidence" }] } as SupportResult;
		cases[2] = { ...successResult("C_AMBIGUOUS_EVIDENCE"), toolsCalled: ["search_faq"] } as SupportResult;
		const { dependencies: injected } = dependencies(cases);

		const summary = await runRealSourceRuntimeProof(environment(), injected);

		expect(summary.allThreeCasesPassed).toBe(false);
		expect(summary.cases.map((item) => item.expectedVsActualPass)).toEqual([false, false, false]);
	});

	it("rejects a successful ticket or handoff outcome even when type, evidence, and required lookup match", async () => {
		const cases = REAL_SOURCE_RUNTIME_PROOF_CASES.map((item) => successResult(item.caseId));
		cases[0] = {
			...successResult("A_SINGLE_EVIDENCE"),
			sessionEvents: [
				{ type: "tool_execution_end", toolName: "create_ticket", isError: false },
			] as SupportResult["sessionEvents"],
		} as SupportResult;
		const { dependencies: injected } = dependencies(cases);

		const summary = await runRealSourceRuntimeProof(environment(), injected);

		expect(summary.cases[0]?.expectedVsActualPass).toBe(false);
		expect(summary.allThreeCasesPassed).toBe(false);
	});

	it("redacts raw upstream error text from a bounded blocked projection", () => {
		const rawUpstreamError = "provider secret payload";
		const output = formatRealSourceRuntimeProofBlockedOutput(new Error(rawUpstreamError));

		expect(output).toBe("REAL_SOURCE_RUNTIME_PROOF_BLOCKED EXECUTION_UNAVAILABLE");
		expect(output).not.toContain(rawUpstreamError);
	});

	it("records zero runtime attempts when configuration blocks before Case A", async () => {
		const error = await execFileAsync(
			process.execPath,
			["--no-warnings", "--experimental-transform-types", "scripts/real-source-runtime-smoke.ts"],
			{
				cwd: process.cwd(),
				env: { ...process.env, ENTERPRISE_RUNTIME_MODE: "unsupported-mode", NODE_NO_WARNINGS: "1" },
			},
		).then(
			() => ({ code: 0, stdout: "", stderr: "" }),
			(caught: unknown) => caught as { code?: number; stdout?: string; stderr?: string },
		);

		expect(error.code).toBe(1);
		expect(error.stderr).toContain("REAL_SOURCE_RUNTIME_PROOF_BLOCKED CONFIGURATION_UNAVAILABLE");
		expect(error.stdout).toContain('"runtimeCaseAttempts":0');
		expect(error.stdout).toContain('"retries":0');
		expect(error.stdout).not.toContain("unsupported-mode");
	});
});
