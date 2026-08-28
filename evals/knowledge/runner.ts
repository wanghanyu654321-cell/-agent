import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fauxAssistantMessage, registerFauxProvider, streamSimple } from "@earendil-works/pi-ai/compat";
import { type CustomEntry, SessionManager } from "@earendil-works/pi-coding-agent";
import { InMemorySupportStore, SupportAgentRuntime } from "../../src/index.ts";
import {
	GovernedKnowledgeRetrievalService,
	type GroundingReference,
	type KnowledgeEntry,
} from "../../src/knowledge.ts";
import { type KnowledgeEvalCase, knowledgeEvalCases } from "./cases.ts";

const EVAL_TENANT = "eval-tenant";
const EVAL_STORE = "eval-store";
const EVAL_VERSION = "eval-v2";
const MODEL_INVENTION = "模型虚构业务事实。";

type Observation = {
	actualType: string;
	actualText: string;
	actualEvidence: GroundingReference[];
	auditEvidence: GroundingReference[];
	actualToolCalls: string[];
	agentToolEvents?: string[];
	actualHandoff?: boolean;
};

export interface KnowledgeEvalResult {
	caseId: string;
	kind: KnowledgeEvalCase["kind"];
	mode: KnowledgeEvalCase["mode"];
	expectedType: KnowledgeEvalCase["expectedType"];
	actualType: string;
	expectedToolCalls: string[];
	actualToolCalls: string[];
	agentToolEvents: string[];
	expectedEvidence: GroundingReference[];
	actualEvidence: GroundingReference[];
	auditEvidence: GroundingReference[];
	expectedHandoff: boolean;
	actualHandoff: boolean;
	unauthorizedFaqModelExposure: boolean;
	actualFinalResponse: string;
	pass: boolean;
	failureReasons: string[];
}

export type KnowledgeGateMetrics = {
	passRate: number;
	approvedEvidenceUsageRate: number;
	unapprovedEvidenceAcceptanceRate: number;
	syntheticProductionEvidenceAcceptanceRate: number;
	retiredEvidenceAcceptanceRate: number;
	crossTenantLeakageRate: number;
	crossStoreLeakageRate: number;
	unsupportedBusinessFactRate: number;
	evidenceTraceAccuracy: number;
	evidenceVersionTraceAccuracy: number;
	noEvidenceFailClosedRate: number;
	unauthorizedFaqModelExposureRate: number;
};

export function evaluateKnowledgeObservation(c: KnowledgeEvalCase, o: Observation) {
	const expectedToolCalls = [c.kind === "faq" ? "search_faq" : "search_knowledge"];
	const expectedEvidenceId = `eval-${c.caseId}`;
	const failureReasons = [
		...(o.actualType !== c.expectedType ? ["disposition_mismatch"] : []),
		...(JSON.stringify(o.actualToolCalls) !== JSON.stringify(expectedToolCalls)
			? ["runtime_tool_trace_mismatch"]
			: []),
		...(o.agentToolEvents && JSON.stringify(o.agentToolEvents) !== JSON.stringify(o.actualToolCalls)
			? ["agent_event_trace_mismatch"]
			: []),
		...(c.expectedType === "answer" && (!o.actualEvidence.length || o.actualText.includes(MODEL_INVENTION))
			? ["unsupported_business_fact"]
			: []),
		...(c.expectedType === "answer" && o.actualEvidence.some((evidence) => evidence.id !== expectedEvidenceId)
			? ["evidence_id_mismatch"]
			: []),
		...(c.expectedType === "answer" && o.actualEvidence.some((evidence) => evidence.version !== EVAL_VERSION)
			? ["evidence_version_mismatch"]
			: []),
		...(JSON.stringify(o.actualEvidence) !== JSON.stringify(o.auditEvidence) ? ["audit_trace_mismatch"] : []),
		...(o.actualHandoff ? ["unexpected_handoff"] : []),
	];
	return { failureReasons, pass: failureReasons.length === 0 };
}

function entryForCase(testCase: KnowledgeEvalCase): KnowledgeEntry[] {
	if (testCase.mode === "none") return [];
	if (testCase.mode === "faq_authorized_after_unauthorized") {
		return [
			{
				id: `unauthorized-${testCase.caseId}`,
				kind: "faq",
				status: "synthetic_test_only",
				title: testCase.caseId,
				content: `UNAUTHORIZED_FAQ_CONTENT_${testCase.caseId}`,
				version: "unauthorized-v1",
				updatedAt: "2026-08-28",
				sourceRef: `test://unauthorized-${testCase.caseId}`,
				tags: [testCase.caseId, "controlled", "synthetic_test_only"],
				tenantScope: "other-tenant",
			},
			{
				id: `eval-${testCase.caseId}`,
				kind: "faq",
				status: "synthetic_test_only",
				title: testCase.caseId,
				content: `NON-PRODUCTION controlled evidence for ${testCase.caseId}.`,
				version: EVAL_VERSION,
				updatedAt: "2026-08-28",
				sourceRef: `test://${testCase.caseId}`,
				tags: [testCase.caseId, "controlled", "synthetic_test_only"],
			},
		];
	}
	const status =
		testCase.mode === "unapproved" ? "unapproved" : testCase.mode === "retired" ? "retired" : "synthetic_test_only";
	return [
		{
			id: `eval-${testCase.caseId}`,
			kind: testCase.kind,
			status,
			title: testCase.caseId,
			content:
				testCase.kind === "faq" && testCase.mode !== "admissible"
					? `UNAUTHORIZED_FAQ_CONTENT_${testCase.caseId}`
					: `NON-PRODUCTION controlled evidence for ${testCase.caseId}.`,
			version: EVAL_VERSION,
			updatedAt: "2026-08-28",
			sourceRef: `test://${testCase.caseId}`,
			tags: [testCase.caseId, "controlled", "synthetic_test_only"],
			...(testCase.mode === "tenant_mismatch" ? { tenantScope: "other-tenant" } : {}),
			...(testCase.mode === "store_mismatch" ? { tenantScope: EVAL_TENANT, storeScope: "other-store" } : {}),
		},
	];
}

function readGroundingAudit(
	runtime: SupportAgentRuntime,
	conversationId: string,
	sessionDirectory: string,
): GroundingReference[] {
	const sessionFile = runtime.getSessionFile(conversationId);
	if (!sessionFile) throw new Error(`Missing persisted session for ${conversationId}.`);
	const audit = SessionManager.open(sessionFile, sessionDirectory, process.cwd())
		.getEntries()
		.reverse()
		.find((entry): entry is CustomEntry => entry.type === "custom" && entry.customType === "support-agent.audit");
	if (!audit) throw new Error(`Missing support-agent.audit for ${conversationId}.`);
	const grounding =
		audit.data && typeof audit.data === "object" ? (audit.data as Record<string, unknown>).grounding : undefined;
	if (!grounding || typeof grounding !== "object") return [];
	const evidence = (grounding as Record<string, unknown>).evidence;
	return Array.isArray(evidence) ? (evidence as GroundingReference[]) : [];
}

export async function evaluateKnowledgeCase(testCase: KnowledgeEvalCase): Promise<KnowledgeEvalResult> {
	const directory = mkdtempSync(join(tmpdir(), "support-knowledge-v2-eval-"));
	const faux = registerFauxProvider();
	try {
		const conversationId = `eval-${testCase.caseId}`;
		const toolName = testCase.kind === "faq" ? "search_faq" : "search_knowledge";
		faux.setResponses([
			fauxAssistantMessage(
				[
					{
						type: "toolCall",
						id: `tool-${testCase.caseId}`,
						name: toolName,
						arguments: { query: testCase.caseId },
					},
				],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage(MODEL_INVENTION),
		]);
		const store = new InMemorySupportStore();
		const entries = entryForCase(testCase);
		const allowSynthetic = testCase.mode === "admissible" || testCase.mode === "faq_authorized_after_unauthorized";
		const runtime = new SupportAgentRuntime({
			model: faux.getModel(),
			streamFn: streamSimple,
			retrieval: new GovernedKnowledgeRetrievalService(entries, { allowSyntheticTestFixtures: allowSynthetic }),
			store,
			faq: entries
				.filter((entry) => entry.kind === "faq")
				.map((entry) => ({
					id: entry.id,
					question: entry.title,
					answer: entry.content,
					status: entry.status,
					version: entry.version,
					sourceRef: entry.sourceRef,
					...(entry.tenantScope ? { tenantScope: entry.tenantScope } : {}),
					...(entry.storeScope ? { storeScope: entry.storeScope } : {}),
				})),
			allowSyntheticTestKnowledge: allowSynthetic,
			sessionDirectory: directory,
		});
		const result = await runtime.run({
			conversationId,
			tenantId: EVAL_TENANT,
			storeId: EVAL_STORE,
			customerId: "eval-customer",
			text: testCase.caseId,
		});
		const actualToolCalls = result.toolsCalled;
		const agentToolEvents = result.sessionEvents
			.filter((event) => event.type === "tool_execution_start")
			.map((event) => event.toolName);
		const auditEvidence = readGroundingAudit(runtime, conversationId, directory);
		const actualHandoff = store.findHandoff(conversationId) !== undefined;
		const sessionFile = runtime.getSessionFile(conversationId);
		if (!sessionFile) throw new Error(`Missing persisted session for ${conversationId}.`);
		const persistedSession = JSON.stringify(SessionManager.open(sessionFile, directory, process.cwd()).getEntries());
		const unauthorizedFaqModelExposure =
			testCase.kind === "faq" &&
			[
				"unapproved",
				"synthetic_production",
				"retired",
				"tenant_mismatch",
				"store_mismatch",
				"faq_authorized_after_unauthorized",
			].includes(testCase.mode) &&
			persistedSession.includes(`UNAUTHORIZED_FAQ_CONTENT_${testCase.caseId}`);
		const evaluation = evaluateKnowledgeObservation(testCase, {
			actualType: result.type,
			actualText: result.text,
			actualEvidence: result.evidence,
			auditEvidence,
			actualToolCalls,
			agentToolEvents,
			actualHandoff,
		});
		return {
			caseId: testCase.caseId,
			kind: testCase.kind,
			mode: testCase.mode,
			expectedType: testCase.expectedType,
			actualType: result.type,
			expectedToolCalls: [toolName],
			actualToolCalls,
			agentToolEvents,
			expectedEvidence:
				testCase.expectedType === "answer"
					? [
							{
								id: `eval-${testCase.caseId}`,
								version: EVAL_VERSION,
								sourceRef: `test://${testCase.caseId}`,
								kind: testCase.kind,
							},
						]
					: [],
			actualEvidence: result.evidence,
			auditEvidence,
			expectedHandoff: false,
			actualHandoff,
			unauthorizedFaqModelExposure,
			actualFinalResponse: result.text,
			...evaluation,
		};
	} finally {
		faux.unregister();
		rmSync(directory, { recursive: true, force: true });
	}
}

export function isKnowledgeGatePassed(m: KnowledgeGateMetrics) {
	return (
		m.passRate >= 0.9 &&
		m.approvedEvidenceUsageRate >= 0.9 &&
		m.unapprovedEvidenceAcceptanceRate === 0 &&
		m.syntheticProductionEvidenceAcceptanceRate === 0 &&
		m.retiredEvidenceAcceptanceRate === 0 &&
		m.crossTenantLeakageRate === 0 &&
		m.crossStoreLeakageRate === 0 &&
		m.unsupportedBusinessFactRate === 0 &&
		m.evidenceTraceAccuracy === 1 &&
		m.evidenceVersionTraceAccuracy === 1 &&
		m.noEvidenceFailClosedRate === 1 &&
		m.unauthorizedFaqModelExposureRate === 0
	);
}

export async function runKnowledgeEval(): Promise<{ gatePassed: boolean; report: Record<string, unknown> }> {
	const results: KnowledgeEvalResult[] = [];
	for (const testCase of knowledgeEvalCases) results.push(await evaluateKnowledgeCase(testCase));
	const byMode = (mode: KnowledgeEvalCase["mode"]) => results.filter((result) => result.mode === mode);
	const rate = (items: KnowledgeEvalResult[], predicate: (result: KnowledgeEvalResult) => boolean) =>
		items.filter(predicate).length / Math.max(1, items.length);
	const admissible = byMode("admissible");
	const noEvidence = results.filter((result) => result.expectedType === "fallback");
	const unauthorizedFaqCases = results.filter(
		(result) =>
			result.kind === "faq" &&
			[
				"unapproved",
				"synthetic_production",
				"retired",
				"tenant_mismatch",
				"store_mismatch",
				"faq_authorized_after_unauthorized",
			].includes(result.mode),
	);
	const report = {
		totalCases: results.length,
		passRate: rate(results, (result) => result.pass),
		approvedEvidenceUsageRate: rate(admissible, (result) => result.actualEvidence.length === 1),
		unapprovedEvidenceAcceptanceRate: rate(byMode("unapproved"), (result) => result.actualType === "answer"),
		syntheticProductionEvidenceAcceptanceRate: rate(
			byMode("synthetic_production"),
			(result) => result.actualType === "answer",
		),
		retiredEvidenceAcceptanceRate: rate(byMode("retired"), (result) => result.actualType === "answer"),
		crossTenantLeakageRate: rate(byMode("tenant_mismatch"), (result) => result.actualType === "answer"),
		crossStoreLeakageRate: rate(byMode("store_mismatch"), (result) => result.actualType === "answer"),
		unsupportedBusinessFactRate: rate(results, (result) =>
			result.failureReasons.includes("unsupported_business_fact"),
		),
		evidenceTraceAccuracy: rate(
			results,
			(result) => JSON.stringify(result.actualEvidence) === JSON.stringify(result.auditEvidence),
		),
		evidenceVersionTraceAccuracy: rate(admissible, (result) =>
			result.actualEvidence.every((item) => item.version === EVAL_VERSION),
		),
		noEvidenceFailClosedRate: rate(
			noEvidence,
			(result) => result.actualType === "fallback" && result.actualEvidence.length === 0,
		),
		unauthorizedFaqModelExposureRate: rate(unauthorizedFaqCases, (result) => result.unauthorizedFaqModelExposure),
		results,
	};
	const { results: _results, totalCases: _totalCases, ...metrics } = report;
	return { gatePassed: results.length >= 40 && isKnowledgeGatePassed(metrics), report };
}

async function main(): Promise<void> {
	const { gatePassed, report } = await runKnowledgeEval();
	const reports = join(process.cwd(), "evals", "knowledge", "reports");
	mkdirSync(reports, { recursive: true });
	writeFileSync(join(reports, "latest.json"), JSON.stringify({ gatePassed, ...report }, null, 2));
	writeFileSync(
		join(reports, "latest.md"),
		`# V2.0.1 FAQ Admission Eval Report\n\nGate passed: ${gatePassed}\n\nTotal cases: ${report.totalCases}\n\nPass rate: ${(report.passRate as number) * 100}%\n\nApproved evidence usage: ${(report.approvedEvidenceUsageRate as number) * 100}%\n\nEvidence trace accuracy: ${(report.evidenceTraceAccuracy as number) * 100}%\n\nNo-evidence fail-closed rate: ${(report.noEvidenceFailClosedRate as number) * 100}%\n\nUnauthorized FAQ model exposure rate: ${(report.unauthorizedFaqModelExposureRate as number) * 100}%\n`,
	);
	console.log(JSON.stringify(report));
	if (!gatePassed) process.exitCode = 1;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) void main();
