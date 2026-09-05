import { execFileSync } from "node:child_process";
import { closeSync, fsyncSync, openSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
	enterpriseKnowledgeModeFromEnv,
	enterpriseRuntimeModeFromEnv,
	type EnterpriseRuntimeFactory,
	type EnterpriseRuntimeModeConfig,
} from "../src/enterprise/application.ts";
import {
	bootstrapPiEnterpriseRuntime,
	createPiEnterpriseRuntimeFactory,
	type PiEnterpriseKnowledgeComposition,
	type ResolvedPiEnterpriseRuntime,
} from "../src/enterprise/pi-runtime.ts";
import { loadPrivateStoreKnowledgeComposition } from "../src/enterprise/private-knowledge.ts";
import { PILOT_REAL_SOURCE_SCOPE } from "../src/enterprise/real-source-knowledge-pack.ts";
import type { SupportRequest, SupportResult } from "../src/index.ts";

export const REAL_SOURCE_RUNTIME_PROOF_CASES = [
	{
		caseId: "A_SINGLE_EVIDENCE",
		category: "SINGLE_EVIDENCE",
		conversationId: "real-source-runtime-proof-a-single-evidence",
		query: "商户无法履约",
		expectedResultType: "answer",
		requiredToolsCalled: ["search_knowledge"],
		expectedEvidenceIds: ["PB-MT-MERCHANT-CANNOT-FULFILL"],
	},
	{
		caseId: "B_ZERO_EVIDENCE",
		category: "ZERO_EVIDENCE",
		conversationId: "real-source-runtime-proof-b-zero-evidence",
		query: "UNRELATED_NO_ANSWER_CASE",
		expectedResultType: "fallback",
		requiredToolsCalled: ["search_knowledge"],
		expectedEvidenceIds: [],
	},
	{
		caseId: "C_AMBIGUOUS_EVIDENCE",
		category: "AMBIGUOUS_EVIDENCE",
		conversationId: "real-source-runtime-proof-c-ambiguous-evidence",
		query: "过期未消费团购券退款",
		expectedResultType: "fallback",
		requiredToolsCalled: ["search_knowledge"],
		expectedEvidenceIds: [],
	},
] as const;

type RealSourceRuntimeProofCase = (typeof REAL_SOURCE_RUNTIME_PROOF_CASES)[number];

export type RealSourceRuntimeProofBlockedCategory =
	| "CONFIGURATION_UNAVAILABLE"
	| "AUTH_UNAVAILABLE"
	| "MODEL_UNAVAILABLE"
	| "MATERIALIZATION_UNAVAILABLE"
	| "PRIVATE_KNOWLEDGE_UNAVAILABLE"
	| "JOURNAL_UNAVAILABLE"
	| "EXECUTION_UNAVAILABLE";

export interface SafeRuntimeCaseEvidence {
	sourceHead: string;
	provider: string;
	model: string;
	caseId: string;
	category: string;
	resultType: string;
	toolsCalled: string[];
	authorizedEvidenceIds: string[];
	elapsedMs: number;
	expectedVsActualPass: boolean;
}

export interface SafeRuntimeProofSummary {
	sourceHead: string;
	provider: string;
	model: string;
	cases: SafeRuntimeCaseEvidence[];
	runtimeCaseAttempts: number;
	retries: 0;
	allThreeCasesPassed: boolean;
}

export interface RealSourceRuntimeProofDependencies {
	sourceHead(): string;
	runtimeModeFromEnv(environment: NodeJS.ProcessEnv): EnterpriseRuntimeModeConfig;
	knowledgeModeFromEnv(environment: NodeJS.ProcessEnv): { mode: "portfolio" | "private" };
	loadPrivateComposition(environment: NodeJS.ProcessEnv): PiEnterpriseKnowledgeComposition & {
		tenantId: string;
		storeId: string;
	};
	bootstrap(options: { providerId: string; modelId: string }): Promise<ResolvedPiEnterpriseRuntime>;
	createRuntimeFactory(
		resolved: ResolvedPiEnterpriseRuntime,
		knowledgeComposition: PiEnterpriseKnowledgeComposition,
	): EnterpriseRuntimeFactory;
	now(): number;
}

class RuntimeProofBlockedError extends Error {
	constructor(
		readonly category: RealSourceRuntimeProofBlockedCategory,
		readonly partial?: Omit<SafeRuntimeProofSummary, "allThreeCasesPassed">,
	) {
		super(category);
		this.name = "RuntimeProofBlockedError";
	}
}

const defaults: RealSourceRuntimeProofDependencies = {
	sourceHead: sourceHeadFromRepository,
	runtimeModeFromEnv: enterpriseRuntimeModeFromEnv,
	knowledgeModeFromEnv: enterpriseKnowledgeModeFromEnv,
	loadPrivateComposition: loadPrivateStoreKnowledgeComposition,
	bootstrap: bootstrapPiEnterpriseRuntime,
	createRuntimeFactory: createPiEnterpriseRuntimeFactory,
	now: Date.now,
};

export function formatRealSourceRuntimeProofBlockedOutput(error: unknown): string {
	const category = error instanceof RuntimeProofBlockedError ? error.category : blockedCategory(error);
	return `REAL_SOURCE_RUNTIME_PROOF_BLOCKED ${category}`;
}

export async function runRealSourceRuntimeProof(
	environment: NodeJS.ProcessEnv = process.env,
	overrides: Partial<RealSourceRuntimeProofDependencies> = {},
): Promise<SafeRuntimeProofSummary> {
	const dependencies = { ...defaults, ...overrides };
	const runtimeMode = requiredPiRuntimeMode(environment, dependencies);
	const sourceHead = requiredSourceHead(dependencies);
	const journal = createSafeJournal(environment.REAL_SOURCE_RUNTIME_PROOF_JOURNAL);
	const partial = {
		sourceHead,
		provider: runtimeMode.providerId,
		model: runtimeMode.modelId,
		cases: [] as SafeRuntimeCaseEvidence[],
		runtimeCaseAttempts: 0,
		retries: 0 as const,
	};

	try {
		journal.append({
			eventType: "run_started",
			sourceHead,
			provider: partial.provider,
			model: partial.model,
			runtimeCaseAttempts: 0,
			retries: 0,
		});
		const composition = requiredPrivateComposition(environment, dependencies);
		const resolved = await dependencies.bootstrap({ providerId: runtimeMode.providerId, modelId: runtimeMode.modelId });
		let resource: ReturnType<EnterpriseRuntimeFactory> | undefined;
		let caught: unknown;
		try {
			resource = dependencies.createRuntimeFactory(resolved, composition)(undefined as never);
			for (const runtimeCase of REAL_SOURCE_RUNTIME_PROOF_CASES) {
				const attemptOrdinal = partial.runtimeCaseAttempts + 1;
				journal.append({
					eventType: "case_attempt_started",
					caseId: runtimeCase.caseId,
					category: runtimeCase.category,
					attemptOrdinal,
				});
				partial.runtimeCaseAttempts = attemptOrdinal;
				const startedAt = dependencies.now();
				const result = await resource.runtime.run(requestFor(runtimeCase));
				const safe = projectSafeCaseEvidence(runtimeCase, result, partial, dependencies.now() - startedAt);
				journal.append({
					eventType: "case_completed",
					caseId: safe.caseId,
					category: safe.category,
					resultType: safe.resultType,
					toolsCalled: safe.toolsCalled,
					authorizedEvidenceIds: safe.authorizedEvidenceIds,
					elapsedMs: safe.elapsedMs,
					expectedVsActualPass: safe.expectedVsActualPass,
				});
				partial.cases.push(safe);
			}
		} catch (error) {
			caught = error;
			throw error;
		} finally {
			try {
				await resource?.close?.();
			} catch (error) {
				if (!caught) throw error;
			}
		}
		const summary = {
			...partial,
			allThreeCasesPassed:
				partial.runtimeCaseAttempts === REAL_SOURCE_RUNTIME_PROOF_CASES.length &&
				partial.cases.length === REAL_SOURCE_RUNTIME_PROOF_CASES.length &&
				partial.cases.every((item) => item.expectedVsActualPass),
		};
		journal.append({
			eventType: "run_completed",
			runtimeCaseAttempts: summary.runtimeCaseAttempts,
			retries: 0,
			allThreeCasesPassed: summary.allThreeCasesPassed,
		});
		return summary;
	} catch (error) {
		const category = error instanceof RuntimeProofBlockedError ? error.category : blockedCategory(error);
		try {
			journal.append({ eventType: "run_blocked", category, runtimeCaseAttempts: partial.runtimeCaseAttempts, retries: 0 });
		} catch {
			throw new RuntimeProofBlockedError("JOURNAL_UNAVAILABLE", partial);
		}
		throw new RuntimeProofBlockedError(category, partial);
	} finally {
		journal.close();
	}
}

type SafeJournalEvent =
	| { eventType: "run_started"; sourceHead: string; provider: string; model: string; runtimeCaseAttempts: 0; retries: 0 }
	| { eventType: "case_attempt_started"; caseId: string; category: string; attemptOrdinal: number }
	| ({ eventType: "case_completed" } & Omit<SafeRuntimeCaseEvidence, "sourceHead" | "provider" | "model">)
	| { eventType: "run_blocked"; category: RealSourceRuntimeProofBlockedCategory; runtimeCaseAttempts: number; retries: 0 }
	| { eventType: "run_completed"; runtimeCaseAttempts: number; retries: 0; allThreeCasesPassed: boolean };

function createSafeJournal(path: string | undefined): { append(event: SafeJournalEvent): void; close(): void } {
	let fd: number;
	try {
		if (!path || !isAbsolute(path)) throw new Error("JOURNAL_PATH_REQUIRED");
		const repositoryRoot = realpathSync(fileURLToPath(new URL("..", import.meta.url)));
		// Resolve parent links before checking scope; wx also rejects existing files/links.
		const canonicalPath = resolve(realpathSync(dirname(path)), basename(path));
		const fromRepository = relative(repositoryRoot, canonicalPath);
		if (!(isAbsolute(fromRepository) || fromRepository === ".." || fromRepository.startsWith(`..${sep}`))) {
			throw new Error("JOURNAL_MUST_BE_OUTSIDE_REPOSITORY");
		}
		fd = openSync(canonicalPath, "wx", 0o600);
	} catch {
		throw new RuntimeProofBlockedError("JOURNAL_UNAVAILABLE");
	}
	let writable = true;
	return {
		append(event) {
			if (!writable) throw new RuntimeProofBlockedError("JOURNAL_UNAVAILABLE");
			try {
				writeFileSync(fd, `${JSON.stringify(event)}\n`, "utf8");
				fsyncSync(fd);
			} catch {
				// Never append behind a possibly partial write or retry a failed persistence operation.
				writable = false;
				throw new RuntimeProofBlockedError("JOURNAL_UNAVAILABLE");
			}
		},
		close() {
			try {
				closeSync(fd);
			} catch {
				throw new RuntimeProofBlockedError("JOURNAL_UNAVAILABLE");
			}
		},
	};
}

function requiredPiRuntimeMode(
	environment: NodeJS.ProcessEnv,
	dependencies: RealSourceRuntimeProofDependencies,
): Required<EnterpriseRuntimeModeConfig> {
	let runtimeMode: EnterpriseRuntimeModeConfig;
	try {
		runtimeMode = dependencies.runtimeModeFromEnv(environment);
	} catch {
		throw new RuntimeProofBlockedError("CONFIGURATION_UNAVAILABLE");
	}
	if (runtimeMode.mode !== "pi-real" || !runtimeMode.providerId || !runtimeMode.modelId) {
		throw new RuntimeProofBlockedError("CONFIGURATION_UNAVAILABLE");
	}
	return { mode: runtimeMode.mode, providerId: runtimeMode.providerId, modelId: runtimeMode.modelId };
}

function requiredPrivateComposition(
	environment: NodeJS.ProcessEnv,
	dependencies: RealSourceRuntimeProofDependencies,
): ReturnType<RealSourceRuntimeProofDependencies["loadPrivateComposition"]> {
	try {
		if (dependencies.knowledgeModeFromEnv(environment).mode !== "private") {
			throw new RuntimeProofBlockedError("CONFIGURATION_UNAVAILABLE");
		}
		const composition = dependencies.loadPrivateComposition(environment);
		if (
			composition.tenantId !== PILOT_REAL_SOURCE_SCOPE.tenantId ||
			composition.storeId !== PILOT_REAL_SOURCE_SCOPE.storeId
		) {
			throw new RuntimeProofBlockedError("PRIVATE_KNOWLEDGE_UNAVAILABLE");
		}
		return composition;
	} catch (error) {
		if (error instanceof RuntimeProofBlockedError) throw error;
		throw new RuntimeProofBlockedError("PRIVATE_KNOWLEDGE_UNAVAILABLE");
	}
}

function requiredSourceHead(dependencies: RealSourceRuntimeProofDependencies): string {
	try {
		const sourceHead = dependencies.sourceHead().trim();
		if (!sourceHead) throw new Error("SOURCE_HEAD_EMPTY");
		return sourceHead;
	} catch {
		throw new RuntimeProofBlockedError("EXECUTION_UNAVAILABLE");
	}
}

function requestFor(runtimeCase: RealSourceRuntimeProofCase): SupportRequest {
	return {
		conversationId: runtimeCase.conversationId,
		tenantId: PILOT_REAL_SOURCE_SCOPE.tenantId,
		storeId: PILOT_REAL_SOURCE_SCOPE.storeId,
		customerId: "portfolio-runtime-proof-customer",
		text: runtimeCase.query,
	};
}

function projectSafeCaseEvidence(
	runtimeCase: RealSourceRuntimeProofCase,
	result: SupportResult,
	partial: Omit<SafeRuntimeProofSummary, "allThreeCasesPassed">,
	elapsedMs: number,
): SafeRuntimeCaseEvidence {
	const toolsCalled = [...result.toolsCalled];
	const authorizedEvidenceIds = result.evidence.map((evidence) => evidence.id);
	return {
		sourceHead: partial.sourceHead,
		provider: partial.provider,
		model: partial.model,
		caseId: runtimeCase.caseId,
		category: runtimeCase.category,
		resultType: result.type,
		toolsCalled,
		authorizedEvidenceIds,
		elapsedMs,
		expectedVsActualPass:
			result.type === runtimeCase.expectedResultType &&
			includesAll(toolsCalled, runtimeCase.requiredToolsCalled) &&
			sameStrings(authorizedEvidenceIds, runtimeCase.expectedEvidenceIds) &&
			!hasSuccessfulBusinessSideEffect(result),
	};
}

function sameStrings(actual: readonly string[], expected: readonly string[]): boolean {
	return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function includesAll(actual: readonly string[], required: readonly string[]): boolean {
	return required.every((toolName) => actual.includes(toolName));
}

function hasSuccessfulBusinessSideEffect(result: SupportResult): boolean {
	return result.sessionEvents.some(
		(event) =>
			event.type === "tool_execution_end" &&
			!event.isError &&
			(event.toolName === "create_ticket" || event.toolName === "handoff_to_human"),
	);
}

function blockedCategory(error: unknown): RealSourceRuntimeProofBlockedCategory {
	if (!(error instanceof Error)) return "EXECUTION_UNAVAILABLE";
	if (
		error.message === "Pi provider authentication is not configured." ||
		error.message === "Pi provider authentication could not be verified."
	) {
		return "AUTH_UNAVAILABLE";
	}
	if (error.message === "Pi provider/model is unavailable.") return "MODEL_UNAVAILABLE";
	if (error.message === "PRIVATE_DIRECTORY_REQUIRED") return "MATERIALIZATION_UNAVAILABLE";
	return "EXECUTION_UNAVAILABLE";
}

function sourceHeadFromRepository(): string {
	return execFileSync("git", ["-c", `safe.directory=${process.cwd()}`, "rev-parse", "HEAD"], {
		cwd: process.cwd(),
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
	}).trim();
}

function printSafeSummary(
	summary: Partial<Omit<SafeRuntimeProofSummary, "cases">> & {
		runtimeCaseAttempts: number;
		retries: 0;
		allThreeCasesPassed: boolean;
	},
): void {
	console.log(JSON.stringify(summary));
}

async function main(): Promise<void> {
	try {
		const summary = await runRealSourceRuntimeProof();
		for (const runtimeCase of summary.cases) console.log(JSON.stringify(runtimeCase));
		printSafeSummary({
			sourceHead: summary.sourceHead,
			provider: summary.provider,
			model: summary.model,
			runtimeCaseAttempts: summary.runtimeCaseAttempts,
			retries: summary.retries,
			allThreeCasesPassed: summary.allThreeCasesPassed,
		});
	} catch (error) {
		if (error instanceof RuntimeProofBlockedError && error.partial) {
			for (const runtimeCase of error.partial.cases) console.log(JSON.stringify(runtimeCase));
			printSafeSummary({ ...error.partial, allThreeCasesPassed: false });
		} else {
			printSafeSummary({ runtimeCaseAttempts: 0, retries: 0, allThreeCasesPassed: false });
		}
		console.error(formatRealSourceRuntimeProofBlockedOutput(error));
		process.exitCode = 1;
	}
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
	void main();
}
