import { execFile } from "node:child_process";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	formatRealSourceRuntimeProofBlockedOutput,
	type RealSourceRuntimeProofDependencies,
	runRealSourceRuntimeProof,
} from "../scripts/real-source-runtime-smoke.ts";
import type { SupportResult } from "../src/index.ts";

// Keep filesystem writes real, but observe/fault the durability boundary.
vi.mock("node:fs", async (original) => {
	const actual = await original<typeof import("node:fs")>();
	return { ...actual, fsyncSync: vi.fn(actual.fsyncSync), writeFileSync: vi.fn(actual.writeFileSync) };
});

let directory: string;
let journalPath: string;
beforeEach(() => {
	directory = fs.mkdtempSync(join(tmpdir(), "runtime-durability-test-"));
	journalPath = join(directory, "proof.jsonl");
});
afterEach(() => {
	vi.mocked(fs.fsyncSync).mockReset();
	vi.mocked(fs.writeFileSync).mockReset();
	fs.rmSync(directory, { recursive: true, force: true });
});

function environment(): NodeJS.ProcessEnv {
	return {
		ENTERPRISE_RUNTIME_MODE: "pi-real",
		PI_PROVIDER: "faux-provider",
		PI_MODEL: "faux-model",
		ENTERPRISE_KNOWLEDGE_MODE: "private",
		REAL_SOURCE_RUNTIME_PROOF_JOURNAL: journalPath,
	};
}

function readJournal(): Record<string, any>[] {
	return fs
		.readFileSync(journalPath, "utf8")
		.trimEnd()
		.split("\n")
		.map((line) => JSON.parse(line));
}

function fixtures() {
	const results = ["answer", "fallback", "fallback"].map(
		(type, index) =>
			({
				type,
				text: "FORBIDDEN_ANSWER",
				evidence: index === 0 ? [{ id: "PB-MT-MERCHANT-CANNOT-FULFILL", content: "FORBIDDEN_CORPUS" }] : [],
				toolsCalled: ["search_faq", "search_knowledge"],
				sessionEvents: [{ type: "secret", payload: "FORBIDDEN_RAW_EVENT" }],
				credential: "FORBIDDEN_CREDENTIAL",
				providerPayload: "FORBIDDEN_PROVIDER_PAYLOAD",
			}) as unknown as SupportResult,
	);
	let index = 0;
	const run = vi.fn(async () => results[index++]);
	const bootstrap = vi.fn(async () => ({ model: {} as never, streamFn: vi.fn() as never }));
	const close = vi.fn(async () => undefined);
	const injected = {
		sourceHead: () => "56f3ed62b67097cb1b05ae5a9c679aa52df4ed2a",
		loadPrivateComposition: () => ({
			faq: [],
			knowledge: [],
			tenantId: "pilot-support-tenant",
			storeId: "pilot-support-store",
			allowSyntheticTestFixtures: false,
			allowSyntheticTestKnowledge: false,
		}),
		bootstrap,
		createRuntimeFactory: () => () => ({ runtime: { run }, close }),
		now: () => 100,
	} as unknown as Partial<RealSourceRuntimeProofDependencies>;
	return { injected, bootstrap, run, close, results };
}

describe("real-source runtime proof durability", () => {
	it("requires an operator journal before any provider bootstrap, including the real CLI entrypoint", async () => {
		const { injected, bootstrap } = fixtures();
		const env = { ...environment(), REAL_SOURCE_RUNTIME_PROOF_JOURNAL: "" };
		await expect(runRealSourceRuntimeProof(env, injected)).rejects.toThrow("JOURNAL_UNAVAILABLE");
		expect(bootstrap).not.toHaveBeenCalled();
		const outcome = await promisify(execFile)(
			process.execPath,
			["--no-warnings", "--experimental-transform-types", "scripts/real-source-runtime-smoke.ts"],
			{ env: { ...process.env, ...env }, cwd: process.cwd() },
		).then(
			() => ({ code: 0, stderr: "", stdout: "" }),
			(error) => error,
		);
		expect(outcome.code).toBe(1);
		expect(outcome.stderr).toContain("REAL_SOURCE_RUNTIME_PROOF_BLOCKED JOURNAL_UNAVAILABLE");
		expect(outcome.stdout).toContain('"runtimeCaseAttempts":0');
	});

	it("fsyncs run_started before bootstrap and each attempt before runtime.run; persists safe completion", async () => {
		const { injected, bootstrap, run, results } = fixtures();
		const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
		let synced: Record<string, any>[] = [];
		vi.mocked(fs.fsyncSync).mockImplementation((fd) => {
			actual.fsyncSync(fd);
			synced = readJournal();
		});
		bootstrap.mockImplementation(async () => {
			expect(synced).toEqual([
				{
					eventType: "run_started",
					sourceHead: "56f3ed62b67097cb1b05ae5a9c679aa52df4ed2a",
					provider: "faux-provider",
					model: "faux-model",
					runtimeCaseAttempts: 0,
					retries: 0,
				},
			]);
			return { model: {} as never, streamFn: vi.fn() as never };
		});
		let ordinal = 0;
		run.mockImplementation(async () => {
			ordinal++;
			expect(synced.at(-1)).toEqual({
				eventType: "case_attempt_started",
				attemptOrdinal: ordinal,
				caseId: ["A_SINGLE_EVIDENCE", "B_ZERO_EVIDENCE", "C_AMBIGUOUS_EVIDENCE"][ordinal - 1],
				category: ["SINGLE_EVIDENCE", "ZERO_EVIDENCE", "AMBIGUOUS_EVIDENCE"][ordinal - 1],
			});
			return results[ordinal - 1];
		});
		const summary = await runRealSourceRuntimeProof(environment(), injected);
		const records = readJournal();
		expect(records.map((entry) => entry.eventType)).toEqual([
			"run_started",
			"case_attempt_started",
			"case_completed",
			"case_attempt_started",
			"case_completed",
			"case_attempt_started",
			"case_completed",
			"run_completed",
		]);
		expect(synced).toEqual(records);
		expect(records.at(-1)).toEqual({
			eventType: "run_completed",
			runtimeCaseAttempts: 3,
			retries: 0,
			allThreeCasesPassed: true,
		});
		const completed = records.filter((entry) => entry.eventType === "case_completed");
		expect(completed[0]).toEqual({
			eventType: "case_completed",
			caseId: "A_SINGLE_EVIDENCE",
			category: "SINGLE_EVIDENCE",
			resultType: "answer",
			toolsCalled: ["search_faq", "search_knowledge"],
			authorizedEvidenceIds: ["PB-MT-MERCHANT-CANNOT-FULFILL"],
			elapsedMs: 0,
			expectedVsActualPass: true,
		});
		expect(completed.map((entry) => entry.expectedVsActualPass)).toEqual([true, true, true]);
		expect(fs.readFileSync(journalPath, "utf8")).not.toContain("FORBIDDEN_");
		expect(fs.readFileSync(journalPath, "utf8")).not.toContain(directory);
		expect(summary.allThreeCasesPassed).toBe(true);
	});

	it("preserves the attempted ordinal and only bounded error metadata on runtime throw", async () => {
		const { injected, run, close } = fixtures();
		run.mockRejectedValueOnce(new Error("FORBIDDEN_PROVIDER_ERROR credential token"));
		await expect(runRealSourceRuntimeProof(environment(), injected)).rejects.toThrow("EXECUTION_UNAVAILABLE");
		expect(readJournal().map((entry) => entry.eventType)).toEqual([
			"run_started",
			"case_attempt_started",
			"run_blocked",
		]);
		expect(readJournal()[1].attemptOrdinal).toBe(1);
		expect(readJournal().at(-1)).toEqual({
			eventType: "run_blocked",
			category: "EXECUTION_UNAVAILABLE",
			runtimeCaseAttempts: 1,
			retries: 0,
		});
		expect(fs.readFileSync(journalPath, "utf8")).not.toContain("FORBIDDEN_");
		expect(run).toHaveBeenCalledTimes(1);
		expect(close).toHaveBeenCalledOnce();
	});

	it("leaves a conservative on-disk attempt count without relying on completion or shutdown", async () => {
		const { injected, run, results } = fixtures();
		let release!: (result: SupportResult) => void;
		let entered!: () => void;
		const started = new Promise<void>((resolve) => {
			entered = resolve;
		});
		run.mockImplementationOnce(() => {
			entered();
			return new Promise((resolve) => {
				release = resolve;
			});
		});
		const execution = runRealSourceRuntimeProof(environment(), injected);
		await started;
		try {
			// Snapshot at the crash boundary: discard all process state. No completion/finally has run.
			const bytes = fs.readFileSync(journalPath, "utf8");
			const recovered = bytes
				.trimEnd()
				.split("\n")
				.map((line) => JSON.parse(line));
			expect(bytes.endsWith("\n")).toBe(true);
			expect(recovered.map((entry) => entry.eventType)).toEqual(["run_started", "case_attempt_started"]);
			expect(
				Math.max(
					...recovered
						.filter((entry) => entry.eventType === "case_attempt_started")
						.map((entry) => entry.attemptOrdinal),
				),
			).toBe(1);
		} finally {
			release(results[0]);
			await execution;
		}
	});

	it("does not overwrite or resume an existing journal", async () => {
		const { injected, bootstrap } = fixtures();
		fs.writeFileSync(journalPath, "existing immutable evidence\n");
		await expect(runRealSourceRuntimeProof(environment(), injected)).rejects.toThrow("JOURNAL_UNAVAILABLE");
		expect(fs.readFileSync(journalPath, "utf8")).toBe("existing immutable evidence\n");
		expect(bootstrap).not.toHaveBeenCalled();
	});

	it("rejects paths inside the repository, including symlinked parents", async () => {
		const { injected, bootstrap } = fixtures();
		const alias = join(directory, "repository-alias");
		fs.symlinkSync(process.cwd(), alias, "junction");
		for (const path of [resolve("proof-must-not-be-created.jsonl"), join(alias, "proof-must-not-be-created.jsonl")]) {
			await expect(
				runRealSourceRuntimeProof({ ...environment(), REAL_SOURCE_RUNTIME_PROOF_JOURNAL: path }, injected),
			).rejects.toThrow("JOURNAL_UNAVAILABLE");
			expect(fs.existsSync(path)).toBe(false);
		}
		expect(bootstrap).not.toHaveBeenCalled();
	});

	it("stops before provider bootstrap if the first fsync fails", async () => {
		const { injected, bootstrap } = fixtures();
		vi.mocked(fs.fsyncSync).mockImplementationOnce(() => {
			throw new Error("SECRET_DISK_ERROR");
		});
		await expect(runRealSourceRuntimeProof(environment(), injected)).rejects.toThrow("JOURNAL_UNAVAILABLE");
		expect(bootstrap).not.toHaveBeenCalled();
		expect(fs.readFileSync(journalPath, "utf8")).not.toContain("SECRET_DISK_ERROR");
	});

	it("stops before the next runtime call if an attempt fsync or completed append fails", async () => {
		const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
		const { injected, run } = fixtures();
		vi.mocked(fs.fsyncSync).mockImplementation((fd) => {
			if (readJournal().at(-1)?.eventType === "case_attempt_started") throw new Error("SECRET_SYNC_ERROR");
			actual.fsyncSync(fd);
		});
		await expect(runRealSourceRuntimeProof(environment(), injected)).rejects.toThrow("JOURNAL_UNAVAILABLE");
		expect(run).not.toHaveBeenCalled();
		vi.mocked(fs.fsyncSync).mockReset();
		journalPath = join(directory, "second-proof.jsonl");
		vi.mocked(fs.writeFileSync).mockImplementation((...args) => {
			if (String(args[1]).includes('"case_completed"')) throw new Error("SECRET_WRITE_ERROR");
			return actual.writeFileSync(...args);
		});
		await expect(runRealSourceRuntimeProof(environment(), injected)).rejects.toThrow("JOURNAL_UNAVAILABLE");
		expect(run).toHaveBeenCalledTimes(1);
		expect(readJournal().at(-1)?.eventType).toBe("case_attempt_started");
	});

	it("persists bootstrap and resource-close failures as blocked without upstream text", async () => {
		const { injected, bootstrap, close } = fixtures();
		bootstrap.mockRejectedValueOnce(new Error("Pi provider authentication is not configured."));
		const error = await runRealSourceRuntimeProof(environment(), injected).catch((error: unknown) => error);
		expect(formatRealSourceRuntimeProofBlockedOutput(error)).toContain("AUTH_UNAVAILABLE");
		expect(readJournal().at(-1)).toEqual({
			eventType: "run_blocked",
			category: "AUTH_UNAVAILABLE",
			runtimeCaseAttempts: 0,
			retries: 0,
		});
		journalPath = join(directory, "close-proof.jsonl");
		close.mockRejectedValueOnce(new Error("SECRET_RESOURCE_ERROR"));
		await expect(runRealSourceRuntimeProof(environment(), injected)).rejects.toThrow("EXECUTION_UNAVAILABLE");
		expect(readJournal().at(-1)).toEqual({
			eventType: "run_blocked",
			category: "EXECUTION_UNAVAILABLE",
			runtimeCaseAttempts: 3,
			retries: 0,
		});
		expect(fs.readFileSync(journalPath, "utf8")).not.toContain("SECRET_RESOURCE_ERROR");
	});
});
