import { randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, linkSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import type { PersistedSemanticInvocationTrace } from "./evaluation.ts";

export interface DurableSemanticGatePaths {
	manifestPath: string;
	journalPath: string;
	finalReportPath: string;
}

export interface DurableSemanticGateAttemptManifest {
	attemptId: string;
	provider: string;
	model: string;
	expectedSemanticCalls: number;
	status: "running";
	[key: string]: unknown;
}

export interface DurableSemanticTraceJournal {
	append(trace: PersistedSemanticInvocationTrace): void;
	close(): void;
}

export interface FinalReportPublicationOperations {
	existsSync: typeof existsSync;
	openSync: typeof openSync;
	writeSync: typeof writeSync;
	fsyncSync: typeof fsyncSync;
	closeSync: typeof closeSync;
	linkSync: typeof linkSync;
	unlinkSync: typeof unlinkSync;
	randomUUID: typeof randomUUID;
}

const defaultFinalReportPublicationOperations: FinalReportPublicationOperations = {
	existsSync,
	openSync,
	writeSync,
	fsyncSync,
	closeSync,
	linkSync,
	unlinkSync,
	randomUUID,
};

function writeAll(descriptor: number, value: string, write: typeof writeSync = writeSync): void {
	const bytes = Buffer.from(value, "utf8");
	let offset = 0;
	while (offset < bytes.length) offset += write(descriptor, bytes, offset, bytes.length - offset, null);
}

function writeNewJson(path: string, value: unknown): void {
	const descriptor = openSync(path, "wx");
	try {
		writeAll(descriptor, `${JSON.stringify(value, null, 2)}\n`);
		fsyncSync(descriptor);
	} finally {
		closeSync(descriptor);
	}
}

function traceKey(trace: PersistedSemanticInvocationTrace): string {
	return `${trace.caseId}\u0000${trace.order}`;
}

function validateTrace(trace: PersistedSemanticInvocationTrace): void {
	if (!Number.isSafeInteger(trace.sequence) || trace.sequence < 1)
		throw new Error("Semantic trace sequence must be a positive integer.");
	if (typeof trace.caseId !== "string" || trace.caseId.length === 0)
		throw new Error("Semantic trace caseId is required.");
	if (trace.order !== "primary" && trace.order !== "reversed") throw new Error("Semantic trace order is invalid.");
	if (trace.candidateCount < 2 || trace.candidateCount > 3 || trace.candidates.length !== trace.candidateCount)
		throw new Error("Semantic trace candidate mapping is invalid.");
	if (
		trace.candidates.some(
			(candidate) =>
				(candidate.label !== "A" && candidate.label !== "B" && candidate.label !== "C") ||
				typeof candidate.evidenceId !== "string" ||
				candidate.evidenceId.length === 0,
		)
	)
		throw new Error("Semantic trace candidate mapping is invalid.");
	if (
		!(["selected", "abstained", "invalid", "timeout", "provider_error"] as const).includes(trace.outcome) ||
		!(["correct", "wrong", "non_selection"] as const).includes(trace.classification)
	)
		throw new Error("Semantic trace outcome is invalid.");
}

function assertUnused(paths: DurableSemanticGatePaths): void {
	for (const path of [paths.manifestPath, paths.journalPath, paths.finalReportPath]) {
		if (existsSync(path))
			throw new Error(`${path} already exists; use an explicitly authorized new recovery attempt identity.`);
	}
}

/** Creates a new recovery identity; existing evidence is never appended or overwritten. */
export function createDurableSemanticGateAttempt(
	paths: DurableSemanticGatePaths,
	manifest: DurableSemanticGateAttemptManifest,
): DurableSemanticTraceJournal {
	assertUnused(paths);
	writeNewJson(paths.manifestPath, manifest);
	const descriptor = openSync(paths.journalPath, "ax");
	const seenInvocationKeys = new Set<string>();
	const seenSequences = new Set<number>();
	let closed = false;
	return {
		append(trace) {
			if (closed) throw new Error("Semantic trace journal is closed.");
			validateTrace(trace);
			const key = traceKey(trace);
			if (seenInvocationKeys.has(key))
				throw new Error(`Duplicate semantic trace for ${trace.caseId}/${trace.order}.`);
			if (seenSequences.has(trace.sequence)) throw new Error(`Duplicate semantic trace sequence ${trace.sequence}.`);
			writeAll(descriptor, `${JSON.stringify(trace)}\n`);
			fsyncSync(descriptor);
			seenInvocationKeys.add(key);
			seenSequences.add(trace.sequence);
		},
		close() {
			if (closed) return;
			closed = true;
			closeSync(descriptor);
		},
	};
}

/** Reads only newline-terminated JSONL records; a final partial write is reported but never interpreted. */
export function readDurableSemanticGateTraces(journalPath: string): {
	traces: PersistedSemanticInvocationTrace[];
	incompleteTrailingLine: boolean;
} {
	const content = readFileSync(journalPath, "utf8");
	const finalNewline = content.lastIndexOf("\n");
	const complete = finalNewline < 0 ? "" : content.slice(0, finalNewline);
	const trailing = finalNewline < 0 ? content : content.slice(finalNewline + 1);
	const traces: PersistedSemanticInvocationTrace[] = [];
	const seenInvocationKeys = new Set<string>();
	const seenSequences = new Set<number>();
	for (const line of complete === "" ? [] : complete.split("\n")) {
		const trace = JSON.parse(line) as PersistedSemanticInvocationTrace;
		validateTrace(trace);
		const key = traceKey(trace);
		if (seenInvocationKeys.has(key)) throw new Error(`Duplicate semantic trace for ${trace.caseId}/${trace.order}.`);
		if (seenSequences.has(trace.sequence)) throw new Error(`Duplicate semantic trace sequence ${trace.sequence}.`);
		seenInvocationKeys.add(key);
		seenSequences.add(trace.sequence);
		traces.push(trace);
	}
	return { traces, incompleteTrailingLine: trailing.length > 0 };
}

function publicationError(error: unknown, cleanupError: unknown): AggregateError {
	const detail = error instanceof Error ? error.message : String(error);
	return new AggregateError([error, cleanupError], `Final report publication failed: ${detail}`);
}

/**
 * Publishes a complete derived report without replacing an existing destination.
 * A same-directory hard link creates the final entry atomically and fails if it already exists;
 * this is safer than Node's overwrite-capable rename semantics on Windows.
 */
export function writeFinalSemanticGateReportOnce(
	path: string,
	report: unknown,
	overrides: Partial<FinalReportPublicationOperations> = {},
): void {
	const operations = { ...defaultFinalReportPublicationOperations, ...overrides };
	if (operations.existsSync(path)) throw new Error(`${path} already exists and will not be overwritten.`);
	const temporaryPath = `${path}.tmp-${process.pid}-${operations.randomUUID()}`;
	let descriptor: number | undefined;
	try {
		descriptor = operations.openSync(temporaryPath, "wx");
		writeAll(descriptor, `${JSON.stringify(report, null, 2)}\n`, operations.writeSync);
		operations.fsyncSync(descriptor);
		operations.closeSync(descriptor);
		descriptor = undefined;
		if (operations.existsSync(path)) throw new Error(`${path} already exists and will not be overwritten.`);
		operations.linkSync(temporaryPath, path);
		operations.unlinkSync(temporaryPath);
	} catch (error) {
		let cleanupError: unknown;
		if (descriptor !== undefined) {
			try {
				operations.closeSync(descriptor);
			} catch (closeError) {
				cleanupError = closeError;
			}
		}
		if (operations.existsSync(temporaryPath)) {
			try {
				operations.unlinkSync(temporaryPath);
			} catch (unlinkError) {
				cleanupError ??= unlinkError;
			}
		}
		if (cleanupError !== undefined) throw publicationError(error, cleanupError);
		throw error;
	}
}
