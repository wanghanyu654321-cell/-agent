import { appendFileSync, existsSync, linkSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	createDurableSemanticGateAttempt,
	type DurableSemanticGatePaths,
	readDurableSemanticGateTraces,
	writeFinalSemanticGateReportOnce,
} from "../evals/selection/semantic/durable-journal.ts";

function paths(): DurableSemanticGatePaths {
	const root = mkdtempSync(join(tmpdir(), "support-agent-semantic-journal-"));
	return {
		manifestPath: join(root, "attempt-manifest.json"),
		journalPath: join(root, "traces.jsonl"),
		finalReportPath: join(root, "final-report.json"),
	};
}

function trace(sequence: number) {
	return {
		sequence,
		caseId: "case-1",
		order: "primary" as const,
		candidateCount: 2,
		candidates: [
			{ label: "A" as const, evidenceId: "gold" },
			{ label: "B" as const, evidenceId: "other" },
		],
		outcome: "selected" as const,
		selection: "A" as const,
		mappedEvidenceId: "gold",
		expectedEvidenceId: "gold",
		classification: "correct" as const,
		elapsedMs: 7,
	};
}

describe("durable semantic Gate journal", () => {
	it("writes and fsyncs a complete trace before recovery reads it", () => {
		const attemptPaths = paths();
		const journal = createDurableSemanticGateAttempt(attemptPaths, {
			attemptId: "attempt-1",
			provider: "openai-codex",
			model: "gpt-5.6-sol",
			expectedSemanticCalls: 44,
			status: "running",
		});
		journal.append(trace(1));
		journal.close();

		expect(existsSync(attemptPaths.manifestPath)).toBe(true);
		expect(readDurableSemanticGateTraces(attemptPaths.journalPath)).toEqual({
			traces: [trace(1)],
			incompleteTrailingLine: false,
		});
		expect(JSON.parse(readFileSync(attemptPaths.manifestPath, "utf8"))).toMatchObject({
			attemptId: "attempt-1",
			status: "running",
		});
	});

	it("recovers valid JSONL records and reports an incomplete trailing line", () => {
		const attemptPaths = paths();
		const journal = createDurableSemanticGateAttempt(attemptPaths, {
			attemptId: "attempt-2",
			provider: "openai-codex",
			model: "gpt-5.6-sol",
			expectedSemanticCalls: 44,
			status: "running",
		});
		journal.append(trace(1));
		journal.close();
		appendFileSync(attemptPaths.journalPath, '{"sequence":2');

		expect(readDurableSemanticGateTraces(attemptPaths.journalPath)).toEqual({
			traces: [trace(1)],
			incompleteTrailingLine: true,
		});
	});

	it("fails closed for duplicate case and order entries", () => {
		const attemptPaths = paths();
		const journal = createDurableSemanticGateAttempt(attemptPaths, {
			attemptId: "attempt-3",
			provider: "openai-codex",
			model: "gpt-5.6-sol",
			expectedSemanticCalls: 44,
			status: "running",
		});
		journal.append(trace(1));
		expect(() => journal.append({ ...trace(2), sequence: 2 })).toThrow("Duplicate semantic trace");
		journal.close();
	});

	it("refuses to append to an existing attempt and to overwrite its final report", () => {
		const attemptPaths = paths();
		const journal = createDurableSemanticGateAttempt(attemptPaths, {
			attemptId: "attempt-4",
			provider: "openai-codex",
			model: "gpt-5.6-sol",
			expectedSemanticCalls: 44,
			status: "running",
		});
		journal.close();

		expect(() =>
			createDurableSemanticGateAttempt(attemptPaths, {
				attemptId: "attempt-4",
				provider: "openai-codex",
				model: "gpt-5.6-sol",
				expectedSemanticCalls: 44,
				status: "running",
			}),
		).toThrow("already exists");
		writeFinalSemanticGateReportOnce(attemptPaths.finalReportPath, { complete: true });
		expect(() => writeFinalSemanticGateReportOnce(attemptPaths.finalReportPath, { complete: true })).toThrow(
			"already exists",
		);
	});

	it("publishes a complete fsynced temporary report before atomically creating the final path", () => {
		const attemptPaths = paths();
		let observedTemporaryReport: unknown;
		writeFinalSemanticGateReportOnce(
			attemptPaths.finalReportPath,
			{ complete: true, count: 44 },
			{
				linkSync(temporaryPath, finalPath) {
					expect(existsSync(finalPath)).toBe(false);
					observedTemporaryReport = JSON.parse(readFileSync(temporaryPath, "utf8"));
					linkSync(temporaryPath, finalPath);
				},
			},
		);

		expect(observedTemporaryReport).toEqual({ complete: true, count: 44 });
		expect(JSON.parse(readFileSync(attemptPaths.finalReportPath, "utf8"))).toEqual({ complete: true, count: 44 });
		expect(readdirSync(pathsRoot(attemptPaths)).filter((name) => name.includes(".tmp-"))).toEqual([]);
	});

	it("preserves an existing final report without creating temporary residue", () => {
		const attemptPaths = paths();
		writeFinalSemanticGateReportOnce(attemptPaths.finalReportPath, { original: true });

		expect(() => writeFinalSemanticGateReportOnce(attemptPaths.finalReportPath, { replacement: true })).toThrow(
			"already exists",
		);
		expect(JSON.parse(readFileSync(attemptPaths.finalReportPath, "utf8"))).toEqual({ original: true });
		expect(readdirSync(pathsRoot(attemptPaths)).filter((name) => name.includes(".tmp-"))).toEqual([]);
	});

	it("cleans the temporary report and propagates a pre-publication fsync failure", () => {
		const attemptPaths = paths();
		expect(() =>
			writeFinalSemanticGateReportOnce(
				attemptPaths.finalReportPath,
				{ complete: true },
				{
					fsyncSync() {
						throw new Error("simulated fsync failure");
					},
				},
			),
		).toThrow("simulated fsync failure");
		expect(existsSync(attemptPaths.finalReportPath)).toBe(false);
		expect(readdirSync(pathsRoot(attemptPaths)).filter((name) => name.includes(".tmp-"))).toEqual([]);
	});
});

function pathsRoot(attemptPaths: DurableSemanticGatePaths): string {
	return attemptPaths.finalReportPath.slice(0, attemptPaths.finalReportPath.lastIndexOf("\\"));
}
