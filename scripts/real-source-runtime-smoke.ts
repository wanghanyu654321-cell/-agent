import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
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
	const composition = requiredPrivateComposition(environment, dependencies);
	const sourceHead = requiredSourceHead(dependencies);
	const partial = {
		sourceHead,
		provider: runtimeMode.providerId,
		model: runtimeMode.modelId,
		cases: [] as SafeRuntimeCaseEvidence[],
		runtimeCaseAttempts: 0,
		retries: 0 as const,
	};

	let resolved: ResolvedPiEnterpriseRuntime;
	try {
		resolved = await dependencies.bootstrap({ providerId: runtimeMode.providerId, modelId: runtimeMode.modelId });
	} catch (error) {
		throw new RuntimeProofBlockedError(blockedCategory(error), partial);
	}

	let resource: ReturnType<EnterpriseRuntimeFactory> | undefined;
	let caught: unknown;
	try {
		resource = dependencies.createRuntimeFactory(resolved, composition)(undefined as never);
		for (const runtimeCase of REAL_SOURCE_RUNTIME_PROOF_CASES) {
			partial.runtimeCaseAttempts += 1;
			const startedAt = dependencies.now();
			let result: SupportResult;
			try {
				result = await resource.runtime.run(requestFor(runtimeCase));
			} catch (error) {
				throw new RuntimeProofBlockedError(blockedCategory(error), partial);
			}
			partial.cases.push(projectSafeCaseEvidence(runtimeCase, result, partial, dependencies.now() - startedAt));
		}
	} catch (error) {
		caught = error;
		throw error;
	} finally {
		try {
			await resource?.close?.();
		} catch (error) {
			if (!caught) throw new RuntimeProofBlockedError("EXECUTION_UNAVAILABLE", partial);
		}
	}

	return {
		...partial,
		allThreeCasesPassed:
			partial.runtimeCaseAttempts === REAL_SOURCE_RUNTIME_PROOF_CASES.length &&
			partial.cases.length === REAL_SOURCE_RUNTIME_PROOF_CASES.length &&
			partial.cases.every((item) => item.expectedVsActualPass),
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
