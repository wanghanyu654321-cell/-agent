import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, registerFauxProvider, streamSimple } from "@earendil-works/pi-ai/compat";
import { type CustomEntry, SessionManager } from "@earendil-works/pi-coding-agent";
import { InMemorySupportStore, SupportAgentRuntime } from "../../src/index.ts";
import {
	GovernedKnowledgeRetrievalService,
	type GroundingReference,
	type KnowledgeEntry,
	loadKnowledgeEntriesFromDirectory,
} from "../../src/knowledge.ts";
import {
	isRetrievalQualityGatePassed,
	type RetrievalEvalCase,
	runRetrievalEvaluation,
} from "../../src/retrieval-eval.ts";

const corpusDirectory = join(import.meta.dirname, "../../knowledge/public-benchmark/approved");
const publicCaseSource = "https://cq.tousu.sina.com.cn/grp_comp/index";

type RuntimeResult = {
	type: "answer" | "fallback" | "escalation";
	text: string;
	evidence: GroundingReference[];
};

export interface PublicRuntimeObservation {
	testCase: RetrievalEvalCase;
	result: RuntimeResult;
	auditEvidence: GroundingReference[];
	knowledgeRoutingDecision?: "NO_CANDIDATE" | "SINGLE_CANDIDATE" | "AMBIGUOUS_MULTIPLE_CANDIDATES";
	corpusEvidence: Array<{ reference: GroundingReference; text: string }>;
	providerText?: string;
}

export interface PublicRuntimeMeasurement {
	caseId: string;
	expectedAnswerable: boolean;
	agentToolEvents: string[];
	auditRead: boolean;
	unsupportedBusinessFact: boolean;
	evidenceTraceAccurate: boolean;
	evidenceVersionTraceAccurate: boolean;
	noEvidenceFailClosed: boolean;
	ambiguousKnowledgeRouting: boolean;
	ambiguousEvidenceFailClosed: boolean;
	routedOutcomeAccurate: boolean;
}

export interface PublicRuntimeMetrics {
	unsupportedBusinessFactRate: number;
	evidenceTraceAccuracy: number;
	evidenceVersionTraceAccuracy: number;
	noEvidenceFailClosedRate: number;
	ambiguousEvidenceFailClosedRate: number;
	routedOutcomeAccuracy: number;
}

function hasBusinessFactualContent(text: string): boolean {
	return /营业|退款|预约|订单|价格|费用|工作日|小时|政策|规则/.test(text);
}

function sameReferences(left: GroundingReference[], right: GroundingReference[]): boolean {
	return (
		left.length === right.length &&
		left.every(
			(reference, index) =>
				reference.id === right[index]?.id &&
				reference.version === right[index]?.version &&
				reference.sourceRef === right[index]?.sourceRef &&
				reference.kind === right[index]?.kind,
		)
	);
}

export function measurePublicRuntimeObservation(
	observation: PublicRuntimeObservation,
): Omit<PublicRuntimeMeasurement, "agentToolEvents" | "auditRead"> {
	const expectedEvidencePresent = observation.testCase.expectedEvidenceIds.every((id) =>
		observation.result.evidence.some((reference) => reference.id === id),
	);
	const auditMatchesResult = sameReferences(observation.result.evidence, observation.auditEvidence);
	const resultMatchesCorpus = observation.result.evidence.every((reference) =>
		observation.corpusEvidence.some(
			(candidate) =>
				candidate.reference.id === reference.id &&
				candidate.reference.version === reference.version &&
				candidate.reference.sourceRef === reference.sourceRef &&
				candidate.reference.kind === reference.kind,
		),
	);
	const expectedGroundedText = observation.result.evidence
		.map((reference) => observation.corpusEvidence.find((candidate) => candidate.reference.id === reference.id)?.text)
		.join("\n\n");
	const providerTextExposed =
		typeof observation.providerText === "string" &&
		observation.providerText.length > 0 &&
		observation.result.text.includes(observation.providerText);
	const unsupportedBusinessFact =
		observation.result.type === "answer" &&
		(providerTextExposed ||
			(observation.result.evidence.length === 0
				? hasBusinessFactualContent(observation.result.text)
				: !resultMatchesCorpus || observation.result.text !== expectedGroundedText));
	const ambiguous = observation.knowledgeRoutingDecision === "AMBIGUOUS_MULTIPLE_CANDIDATES";
	const ambiguousEvidenceFailClosed =
		!ambiguous ||
		(observation.result.type === "fallback" &&
			observation.result.evidence.length === 0 &&
			observation.auditEvidence.length === 0 &&
			!providerTextExposed);
	const evidenceTraceAccurate = observation.testCase.expectedAnswerable
		? expectedEvidencePresent && auditMatchesResult
		: observation.result.evidence.length === 0 && observation.auditEvidence.length === 0;
	return {
		caseId: observation.testCase.caseId,
		expectedAnswerable: observation.testCase.expectedAnswerable,
		unsupportedBusinessFact,
		evidenceTraceAccurate,
		evidenceVersionTraceAccurate: resultMatchesCorpus && auditMatchesResult,
		noEvidenceFailClosed: observation.testCase.expectedAnswerable
			? true
			: observation.result.type === "fallback" &&
				observation.result.evidence.length === 0 &&
				observation.auditEvidence.length === 0 &&
				!providerTextExposed,
		ambiguousKnowledgeRouting: ambiguous,
		ambiguousEvidenceFailClosed,
		routedOutcomeAccurate: evidenceTraceAccurate || ambiguousEvidenceFailClosed,
	};
}

export function summarizePublicRuntimeMeasurements(
	measurements: Array<
		Pick<
			PublicRuntimeMeasurement,
			| "expectedAnswerable"
			| "unsupportedBusinessFact"
			| "evidenceTraceAccurate"
			| "evidenceVersionTraceAccurate"
			| "noEvidenceFailClosed"
			| "ambiguousKnowledgeRouting"
			| "ambiguousEvidenceFailClosed"
			| "routedOutcomeAccurate"
		>
	>,
): { metrics: PublicRuntimeMetrics; gatePassed: boolean } {
	const rate = <T>(items: T[], predicate: (item: T) => boolean): number =>
		items.filter(predicate).length / Math.max(1, items.length);
	const noEvidenceMeasurements = measurements.filter((measurement) => !measurement.expectedAnswerable);
	const ambiguousMeasurements = measurements.filter((measurement) => measurement.ambiguousKnowledgeRouting);
	const metrics = {
		unsupportedBusinessFactRate: rate(measurements, (measurement) => measurement.unsupportedBusinessFact),
		evidenceTraceAccuracy: rate(measurements, (measurement) => measurement.evidenceTraceAccurate),
		evidenceVersionTraceAccuracy: rate(measurements, (measurement) => measurement.evidenceVersionTraceAccurate),
		noEvidenceFailClosedRate: rate(noEvidenceMeasurements, (measurement) => measurement.noEvidenceFailClosed),
		ambiguousEvidenceFailClosedRate: rate(
			ambiguousMeasurements,
			(measurement) => measurement.ambiguousEvidenceFailClosed,
		),
		routedOutcomeAccuracy: rate(measurements, (measurement) => measurement.routedOutcomeAccurate),
	};
	return {
		metrics,
		gatePassed:
			metrics.unsupportedBusinessFactRate === 0 &&
			metrics.evidenceVersionTraceAccuracy === 1 &&
			metrics.noEvidenceFailClosedRate === 1 &&
			metrics.ambiguousEvidenceFailClosedRate === 1 &&
			metrics.routedOutcomeAccuracy === 1,
	};
}

type QueryGroup = { id: string; category: string; queries: string[] };
const groups: QueryGroup[] = [
	{
		id: "PB-MT-VOUCHER-USE",
		category: "group-buy voucher usage",
		queries: [
			"团购券过了有效期还能核销吗",
			"我的团购券已过期还能用吗",
			"券过期后商家还要提供服务吗",
			"团购券有效期怎么看",
			"核销团购券要按什么说明使用",
		],
	},
	{
		id: "PB-MT-CHANGE-REFUND",
		category: "rescheduling / cancellation",
		queries: [
			"商家要变更团购内容我不接受能退款吗",
			"预约项目变更我不接受怎么办",
			"页面信息错了我不同意新内容可以取消吗",
			"物料短缺换项目我不接受能退吗",
			"商家改了团购服务如何退款",
		],
	},
	{
		id: "PB-MT-MERCHANT-CANNOT-FULFILL",
		category: "merchant inability to provide purchased service",
		queries: [
			"商家停业无法提供服务能退款吗",
			"门店无法履约团购订单怎么办",
			"商户原因不能提供项目如何处理",
			"买了服务商家说做不了能退吗",
			"平台核实商家无法服务后怎么办",
		],
	},
	{
		id: "PB-MT-AFTERSALES-CONTACT",
		category: "customer after-sales flow",
		queries: [
			"已经消费后想申请退款应该联系谁",
			"服务做完有特殊情况怎么售后",
			"已消费团购券还能退款吗",
			"消费后问题先找商户还是客服",
			"用过服务后需要退款怎么处理",
		],
	},
	{
		id: "PB-MT-REFUND-ORIGINAL-PAYMENT",
		category: "refund processing / original-payment return",
		queries: [
			"退款会原路退回吗",
			"退款到账回到哪个支付账户",
			"第三方支付退款没回原账户怎么办",
			"申请退款后原支付怎么退",
			"退款到账路径是什么",
		],
	},
	{
		id: "PB-MT-UNCONSUMED-REFUND",
		category: "refund eligibility",
		queries: [
			"团购券未消费怎么申请退款",
			"没用过的团购券能随时退款吗",
			"未消费退款审核要多久",
			"没有核销的券如何退款",
			"团购券没使用退款多久到账",
		],
	},
	{
		id: "PB-MT-EXPIRED-AUTO-REFUND",
		category: "unconsumed voucher handling",
		queries: [
			"团购券过期没用会自动退款吗",
			"过期自动退要等几天",
			"未消费过期券七个工作日退款吗",
			"什么订单支持过期自动退",
			"券到期后自动退款条件是什么",
		],
	},
	{
		id: "PB-MT-FULFILLMENT-RESERVATION",
		category: "appointment / reservation handling",
		queries: [
			"预约满了商家不接待怎么办",
			"商家不承认预约结果怎么办",
			"预约到店后说不能提供服务",
			"预定成功却被拒绝接待",
			"预约团购券到店被拒怎么办",
		],
	},
	{
		id: "PB-MT-FULFILLMENT-CLOSURE",
		category: "merchant fulfillment after reservation",
		queries: [
			"门店装修到店无法消费怎么办",
			"商家歇业但团购券还能用吗",
			"门店无法营业没有设置不可用时间",
			"到店才发现商家关门怎么办",
			"商户装修没有提前告知团购不可用",
		],
	},
	{
		id: "PB-MT-FULFILLMENT-ALTERNATIVE",
		category: "ordinary customer-service escalation",
		queries: [
			"商家要替换团购项目我不认可",
			"经营调整换服务价值不能低于原来吗",
			"团购组成变了如何沟通",
			"商家给替换方案但我不同意",
			"原项目没有了商户应该怎么接待",
		],
	},
];

function provenance(index: number): RetrievalEvalCase["queryProvenance"] {
	if (index < 10) return "PUBLIC_REAL_CASE";
	if (index < 40) return "HUMAN_AUTHORED";
	return "SYNTHETIC_QUERY";
}

export const publicBenchmarkCases: RetrievalEvalCase[] = [
	...groups.flatMap((group, groupIndex) =>
		group.queries.map((query, queryIndex) => {
			const index = groupIndex * group.queries.length + queryIndex;
			const queryProvenance = provenance(index);
			return {
				caseId: `public-${String(index + 1).padStart(2, "0")}`,
				query,
				tenantId: "public-benchmark",
				storeId: "public-benchmark-store",
				expectedAnswerable: true,
				expectedEvidenceIds: [group.id],
				queryProvenance,
				category: group.category,
				difficulty: queryIndex < 2 ? "direct" : "customer-variant",
				...(queryProvenance === "PUBLIC_REAL_CASE"
					? { provenanceSourceRef: publicCaseSource, queryDisclosure: "paraphrased" as const }
					: {
							queryDisclosure:
								queryProvenance === "SYNTHETIC_QUERY" ? ("synthetic" as const) : ("human_authored" as const),
						}),
			};
		}),
	),
	...[
		"请告诉我门店今天几点结束营业",
		"我的美容服务该怎么操作",
		"可以把团购券换成现金吗",
		"我想修改其他顾客的订单",
		"店员电话是多少",
		"请给我一个新的优惠券",
		"我的账户为什么被冻结",
		"团购券能转卖给别人吗",
		"商家应该给我多少赔偿",
		"请按常识判断我的皮肤问题",
	].map((query, index) => ({
		caseId: `public-no-answer-${index + 1}`,
		query,
		tenantId: "public-benchmark",
		storeId: "public-benchmark-store",
		expectedAnswerable: false,
		expectedEvidenceIds: [],
		queryProvenance:
			index < 2
				? ("PUBLIC_REAL_CASE" as const)
				: index < 7
					? ("HUMAN_AUTHORED" as const)
					: ("SYNTHETIC_QUERY" as const),
		category: "no-answer",
		difficulty: "fail-closed",
		...(index < 2
			? { provenanceSourceRef: publicCaseSource, queryDisclosure: "paraphrased" as const }
			: { queryDisclosure: index < 7 ? ("human_authored" as const) : ("synthetic" as const) }),
	})),
	{
		caseId: "public-cross-tenant",
		query: "租户专属基准令牌A",
		tenantId: "public-benchmark-tenant-b",
		storeId: "public-benchmark-store",
		expectedAnswerable: false,
		expectedEvidenceIds: [],
		queryProvenance: "SYNTHETIC_QUERY",
		category: "scope",
		difficulty: "scope",
		scopeExpectation: "tenant",
		queryDisclosure: "synthetic",
	},
	{
		caseId: "public-cross-store",
		query: "门店专属基准令牌B",
		tenantId: "public-benchmark-tenant-a",
		storeId: "public-benchmark-store-b",
		expectedAnswerable: false,
		expectedEvidenceIds: [],
		queryProvenance: "SYNTHETIC_QUERY",
		category: "scope",
		difficulty: "scope",
		scopeExpectation: "store",
		queryDisclosure: "synthetic",
	},
];

export function loadPublicBenchmarkEntries(): KnowledgeEntry[] {
	return loadKnowledgeEntriesFromDirectory(corpusDirectory);
}

function frozenBaselineMatches(entry: KnowledgeEntry, query: string): boolean {
	const terms = query
		.toLowerCase()
		.split(/[\s，。！？、；：“”‘’,.!?;:'"-]+/)
		.map((term) => term.trim())
		.filter((term) => term.length > 0);
	const haystack = `${entry.title}\n${entry.content}\n${entry.tags.join(" ")}`.toLowerCase();
	return terms.length > 0 && terms.every((term) => haystack.includes(term));
}

export async function runFirstPublicBenchmarkBaseline() {
	const entries = loadPublicBenchmarkEntries();
	return runRetrievalEvaluation(
		{
			search: async (query, signal, context) => {
				if (signal.aborted) throw new Error("Frozen baseline search aborted.");
				return entries
					.filter((entry) => frozenBaselineMatches(entry, query))
					.filter((entry) => !entry.tenantScope || entry.tenantScope === context?.tenantId)
					.filter((entry) => !entry.storeScope || entry.storeScope === context?.storeId)
					.map((entry) => ({
						id: entry.id,
						text: entry.content,
						knowledge: {
							kind: entry.kind,
							status: entry.status,
							version: entry.version,
							sourceRef: entry.sourceRef,
						},
					}));
			},
		},
		publicBenchmarkCases,
	);
}

export async function runPublicBenchmarkEvaluation() {
	const entries = loadPublicBenchmarkEntries();
	const retrieval = new GovernedKnowledgeRetrievalService(entries, { rankByRelevance: true });
	const final = await runRetrievalEvaluation(retrieval, publicBenchmarkCases);
	const first = await runFirstPublicBenchmarkBaseline();
	return { first, final: { ...final, gatePassed: isRetrievalQualityGatePassed(final.metrics) } };
}

export async function runPublicBenchmarkRuntimeEvaluation() {
	const directory = mkdtempSync(join(tmpdir(), "public-benchmark-runtime-"));
	const faux = registerFauxProvider();
	const corpusEvidence = loadPublicBenchmarkEntries().map((entry) => ({
		reference: { id: entry.id, version: entry.version, sourceRef: entry.sourceRef, kind: entry.kind },
		text: entry.content,
	}));
	const results: Array<PublicRuntimeMeasurement & { pass: boolean }> = [];
	try {
		for (const testCase of publicBenchmarkCases) {
			faux.setResponses([
				fauxAssistantMessage(
					[
						{
							type: "toolCall",
							id: testCase.caseId,
							name: "search_knowledge",
							arguments: { query: testCase.query },
						},
					],
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage("UNTRUSTED_PROVIDER_TEXT"),
			]);
			const store = new InMemorySupportStore();
			const runtime = new SupportAgentRuntime({
				model: faux.getModel(),
				streamFn: streamSimple,
				retrieval: new GovernedKnowledgeRetrievalService(loadPublicBenchmarkEntries(), { rankByRelevance: true }),
				store,
				faq: [],
				sessionDirectory: directory,
			});
			const result = await runtime.run({
				conversationId: testCase.caseId,
				tenantId: testCase.tenantId,
				storeId: testCase.storeId,
				customerId: "public-benchmark-customer",
				text: testCase.query,
			});
			const audit = SessionManager.open(runtime.getSessionFile(testCase.caseId)!, directory, process.cwd())
				.getEntries()
				.find(
					(entry): entry is CustomEntry => entry.type === "custom" && entry.customType === "support-agent.audit",
				)?.data as
				| {
						grounding?: { evidence?: GroundingReference[] };
						knowledgeRouting?: {
							decision?: "NO_CANDIDATE" | "SINGLE_CANDIDATE" | "AMBIGUOUS_MULTIPLE_CANDIDATES";
						};
				  }
				| undefined;
			const measurement = measurePublicRuntimeObservation({
				testCase,
				result,
				auditEvidence: audit?.grounding?.evidence ?? [],
				knowledgeRoutingDecision: audit?.knowledgeRouting?.decision,
				corpusEvidence,
				providerText: "UNTRUSTED_PROVIDER_TEXT",
			});
			results.push({
				...measurement,
				agentToolEvents: result.toolsCalled,
				auditRead: Boolean(audit),
				pass:
					!measurement.unsupportedBusinessFact &&
					measurement.evidenceVersionTraceAccurate &&
					measurement.noEvidenceFailClosed &&
					measurement.ambiguousEvidenceFailClosed &&
					measurement.routedOutcomeAccurate,
			});
		}
		const summary = summarizePublicRuntimeMeasurements(results);
		return {
			results,
			...summary,
		};
	} finally {
		faux.unregister();
		rmSync(directory, { recursive: true, force: true });
	}
}
