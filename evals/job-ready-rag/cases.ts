import { getCorpusEntry } from "./corpus.ts";
import type { RetrievalEvalCase, Scope } from "./schema.ts";

/**
 * The frozen 40-case human-authored retrieval population (contract section 10):
 * 24 answerable, 8 no-answer, 8 ambiguous. At least 8 cases are explicit
 * tenant/store/approval/version negative controls.
 *
 * Authoring rules honored here:
 * - No real customer transcripts; every query is human-authored.
 * - No invented professional/beauty policy as factual gold; answerable and
 *   ambiguous gold bind only to approved public-benchmark propositions.
 * - approved-source cases and synthetic isolation fixtures are distinguished by
 *   `provenance`.
 * - Answerable gold has exactly one sufficient entry; ambiguous gold has at
 *   least two distinct admissible plausible entries and expects no final
 *   authorized evidence; no-answer gold is empty.
 * - `expectedVersions`/`expectedSourceRefs` are derived from the frozen corpus
 *   so scoring checks version/source, not IDs alone.
 */

const BENCHMARK_SCOPE: Scope = { tenantId: "public-benchmark", storeId: "public-benchmark-store" };
const BENCHMARK_PROBE_SCOPE: Scope = { tenantId: "public-benchmark-tenant-a", storeId: "public-benchmark-store-a" };

function goldBindings(goldIds: readonly string[]): {
	expectedVersions: Record<string, string>;
	expectedSourceRefs: Record<string, string>;
	sourceRefs: string[];
} {
	const expectedVersions: Record<string, string> = {};
	const expectedSourceRefs: Record<string, string> = {};
	const sourceRefs: string[] = [];
	for (const id of goldIds) {
		const entry = getCorpusEntry(id);
		expectedVersions[id] = entry.version;
		expectedSourceRefs[id] = entry.sourceRef;
		sourceRefs.push(entry.sourceRef);
	}
	return { expectedVersions, expectedSourceRefs, sourceRefs };
}

function answerable(
	caseId: string,
	query: string,
	goldId: string,
	goldReason: string,
	scope: Scope = BENCHMARK_SCOPE,
): RetrievalEvalCase {
	const { expectedVersions, expectedSourceRefs, sourceRefs } = goldBindings([goldId]);
	return {
		caseId,
		query,
		scope,
		expectedEvidenceIds: [goldId],
		expectedAnswerability: "answerable",
		expectedVersions,
		expectedSourceRefs,
		provenance: "human_authored_official_source",
		sourceRefs,
		goldReason,
	};
}

function ambiguous(
	caseId: string,
	query: string,
	goldIds: readonly string[],
	goldReason: string,
	scope: Scope = BENCHMARK_SCOPE,
): RetrievalEvalCase {
	const { expectedVersions, expectedSourceRefs, sourceRefs } = goldBindings(goldIds);
	return {
		caseId,
		query,
		scope,
		expectedEvidenceIds: [...goldIds],
		expectedAnswerability: "ambiguous",
		expectedVersions,
		expectedSourceRefs,
		provenance: "human_authored_official_source",
		sourceRefs,
		goldReason,
	};
}

function noAnswer(caseId: string, query: string, scope: Scope, goldReason: string): RetrievalEvalCase {
	return {
		caseId,
		query,
		scope,
		expectedEvidenceIds: [],
		expectedAnswerability: "no_answer",
		expectedVersions: {},
		expectedSourceRefs: {},
		provenance: "synthetic_isolation_fixture",
		sourceRefs: [],
		goldReason,
	};
}

// --- answerable gold reasons (one sufficient approved entry each) ---------

const REASON_VOUCHER_USE =
	"查询直接问团购券超过约定有效期后能否继续要求商户履约；该条目是美团团购用户服务条款对有效期与核销的直接规定，单条即充分，无需其他条目。";
const REASON_CHANGE_REFUND =
	"查询直接问商户变更团购内容且用户不接受时能否退款；该条目正是条款对变更导致合同解除并可退款的直接规定，单条即充分。";
const REASON_MERCHANT_CANNOT_FULFILL =
	"查询直接问商户因自身原因无法提供团购服务经核实后的后果；该条目是条款对无法履约经核实解除合同并可退款的直接规定，单条即充分。";
const REASON_AFTERSALES_CONTACT =
	"查询直接问实际消费后再要求退款的处理与联系路径；该条目是条款对消费后原则可拒绝并应先联系商户的直接规定，单条即充分。";
const REASON_REFUND_ORIGINAL_PAYMENT =
	"查询直接问符合条件退款的到账路径；该条目是条款对按原支付路径原路退回的直接规定，单条即充分。";
const REASON_UNCONSUMED_REFUND =
	"查询直接问未消费团购券随时退款的到账时限；该条目是服务保障对审核通过后1至7个工作日退回原支付方的直接规定，单条即充分。";
const REASON_EXPIRED_AUTO_REFUND =
	"查询直接问标明过期自动退的团购券到期后的自动退款时限；该条目是服务保障对7个工作日内自动退款的直接规定，单条即充分。";
const REASON_FULFILLMENT_RESERVATION =
	"查询直接问按预约到店后被以预约满了等理由拒绝接待的认定；该条目是履约保障办法对不接待场景的直接列举，单条即充分。";
const REASON_FULFILLMENT_CLOSURE =
	"查询直接问商户装修歇业无法营业时的告知与不可用时间设置义务；该条目是履约保障办法对该义务及未告知即属不接待的直接规定，单条即充分。";
const REASON_FULFILLMENT_ALTERNATIVE =
	"查询直接问商户无法提供团购部分组成时的替换价值要求与不认可处理；该条目是履约保障办法对替换价值不得低于原价值及线下沟通接待的直接规定，单条即充分。";
const REASON_DP_HELP_UNVERIFIED =
	"查询直接问大众点评普通团购券未验证/未消费时的退款帮助；该条目是大众点评官方帮助页对未消费可申请退款且已验证券不适用的直接说明，单条即充分。";
const REASON_SCOPE_TENANT =
	"查询使用租户专属基准令牌A且运行于该受治理条目声明的正确租户/门店范围，范围匹配故应准入；单条探针即充分，用于正向确认隔离不误伤合法范围。";
const REASON_SCOPE_STORE =
	"查询使用门店专属基准令牌B且运行于该受治理条目声明的正确租户/门店范围，范围匹配故应准入；单条探针即充分，用于正向确认隔离不误伤合法范围。";

// --- ambiguous gold reasons (>=2 distinct admissible plausible entries) ---

const REASON_AMB_REFUND_TIMING =
	"查询同时落在两条独立已批准条目上：未消费随时退款1至7个工作日 与 过期自动退7个工作日。二者均可准入且各自部分相关，但没有单一条目能直接充分授权唯一答复，故期望路由2+且不产出唯一授权证据。";
const REASON_AMB_MERCHANT_CHANGE =
	"查询同时命中商户变更团购内容可退款 与 商户无法履约经核实可退款两条独立已批准条目。二者均可准入且都指向退款，但触发要件不同，无单一条目可直接充分授权唯一答复，期望路由2+。";
const REASON_AMB_FULFILLMENT_DENIED =
	"查询同时命中预约到店被拒接待 与 装修歇业未告知致无法消费两条独立已批准不接待场景条目。二者均可准入且都属不接待，但事实前提不同，无单一条目可直接充分授权唯一答复，期望路由2+。";
const REASON_AMB_PARTIAL_VS_NONE =
	"查询同时命中商户无法提供部分组成的替换接待规则 与 商户无法提供团购服务经核实可退款两条独立已批准条目。部分替换与整体无法履约的处置不同，二者均可准入，无单一条目可直接充分授权唯一答复，期望路由2+。";
const REASON_AMB_EXPIRED_HANDLING =
	"查询同时命中团购券超期不能再要求履约 与 过期未消费自动退款两条独立已批准条目。能否使用与是否自动退取决于页面标明，二者均可准入，无单一条目可直接充分授权唯一答复，期望路由2+。";
const REASON_AMB_CONSUMED_BOUNDARY =
	"查询同时命中消费后原则可拒绝并先联系商户 与 未消费随时退款两条独立已批准条目。是否已消费决定相反处置，查询未澄清，二者均可准入，无单一条目可直接充分授权唯一答复，期望路由2+。";
const REASON_AMB_REFUND_PATH_TIME =
	"查询同时命中按原支付路径原路退回 与 未消费退款1至7个工作日到账两条独立已批准条目。路径与时限是不同维度，二者均可准入，无单一条目可直接充分授权唯一答复，期望路由2+。";
const REASON_AMB_UNVERIFIED_UNCONSUMED =
	"查询同时命中大众点评未验证普通券退款帮助 与 美团未消费退款机制两条独立已批准条目。平台与券状态不同，二者均可准入，无单一条目可直接充分授权唯一答复，期望路由2+。";

// --- no-answer gold reasons (governance must exclude; gold empty) ---------

const REASON_NOANS_TENANT =
	"查询使用合成租户隔离令牌，但运行于与该夹具声明租户不同的范围。受治理知识在指定租户外不得准入，唯一可能匹配的合成夹具被范围排除，正确结果为空；检索不可用绝不计为正确no-answer。";
const REASON_NOANS_STORE =
	"查询使用合成门店隔离令牌，但运行于与该夹具声明门店不同的范围。受治理知识在指定门店外不得准入，唯一可能匹配的合成夹具被范围排除，正确结果为空；检索不可用绝不计为正确no-answer。";
const REASON_NOANS_UNAPPROVED =
	"查询使用合成未批准草稿令牌且范围匹配，但该夹具状态为unapproved。未批准条目永不准入，正确结果为空，用以确认状态治理独立于范围生效；检索不可用绝不计为正确no-answer。";
const REASON_NOANS_SYNTHETIC_ONLY =
	"查询使用合成测试专用令牌且范围匹配，但该夹具状态为synthetic_test_only。生产检索模式不准入测试专用夹具，正确结果为空，用以确认测试夹具不泄漏进生产答复；检索不可用绝不计为正确no-answer。";
const REASON_NOANS_RETIRED =
	"查询使用合成过期/废止版本令牌且范围匹配，但该夹具状态为retired。已退休版本永不准入，正确结果为空，用以确认版本时效治理生效；检索不可用绝不计为正确no-answer。";

// --- 24 answerable cases --------------------------------------------------

const answerableCases: RetrievalEvalCase[] = [
	answerable(
		"JR-RAG-ANS-01",
		"美团团购券过了约定有效期还能要求商户提供服务吗？",
		"PB-MT-VOUCHER-USE",
		REASON_VOUCHER_USE,
	),
	answerable("JR-RAG-ANS-02", "团购券超过有效期后还能正常核销使用吗？", "PB-MT-VOUCHER-USE", REASON_VOUCHER_USE),
	answerable(
		"JR-RAG-ANS-03",
		"商户变更了团购内容我不接受可以要求退款吗？",
		"PB-MT-CHANGE-REFUND",
		REASON_CHANGE_REFUND,
	),
	answerable(
		"JR-RAG-ANS-04",
		"因页面信息错误商户要改团购合同我不同意能退吗？",
		"PB-MT-CHANGE-REFUND",
		REASON_CHANGE_REFUND,
	),
	answerable(
		"JR-RAG-ANS-05",
		"商户因自身原因无法提供团购服务经核实后可以退款吗？",
		"PB-MT-MERCHANT-CANNOT-FULFILL",
		REASON_MERCHANT_CANNOT_FULFILL,
	),
	answerable(
		"JR-RAG-ANS-06",
		"商家停业做不了团购经美团核实属实合同会解除吗？",
		"PB-MT-MERCHANT-CANNOT-FULFILL",
		REASON_MERCHANT_CANNOT_FULFILL,
	),
	answerable(
		"JR-RAG-ANS-07",
		"已经实际消费后再要求退款商户可以拒绝吗？",
		"PB-MT-AFTERSALES-CONTACT",
		REASON_AFTERSALES_CONTACT,
	),
	answerable(
		"JR-RAG-ANS-08",
		"消费过程中有特殊情况申请退款应该先联系谁？",
		"PB-MT-AFTERSALES-CONTACT",
		REASON_AFTERSALES_CONTACT,
	),
	answerable(
		"JR-RAG-ANS-09",
		"符合条件的团购退款会按原支付路径退回吗？",
		"PB-MT-REFUND-ORIGINAL-PAYMENT",
		REASON_REFUND_ORIGINAL_PAYMENT,
	),
	answerable(
		"JR-RAG-ANS-10",
		"团购退款到账是退回原来的支付账户吗？",
		"PB-MT-REFUND-ORIGINAL-PAYMENT",
		REASON_REFUND_ORIGINAL_PAYMENT,
	),
	answerable(
		"JR-RAG-ANS-11",
		"未消费的团购券申请随时退款一般多久退回？",
		"PB-MT-UNCONSUMED-REFUND",
		REASON_UNCONSUMED_REFUND,
	),
	answerable(
		"JR-RAG-ANS-12",
		"没有核销的团购订单退款审核通过后几个工作日到账？",
		"PB-MT-UNCONSUMED-REFUND",
		REASON_UNCONSUMED_REFUND,
	),
	answerable(
		"JR-RAG-ANS-13",
		"标明支持过期自动退的团购券到期后多久自动退款？",
		"PB-MT-EXPIRED-AUTO-REFUND",
		REASON_EXPIRED_AUTO_REFUND,
	),
	answerable(
		"JR-RAG-ANS-14",
		"过期未消费的团购订单会在几个工作日内自动退？",
		"PB-MT-EXPIRED-AUTO-REFUND",
		REASON_EXPIRED_AUTO_REFUND,
	),
	answerable(
		"JR-RAG-ANS-15",
		"按预约到店后商户以预约满了拒绝接待属于什么场景？",
		"PB-MT-FULFILLMENT-RESERVATION",
		REASON_FULFILLMENT_RESERVATION,
	),
	answerable(
		"JR-RAG-ANS-16",
		"商户不承认预约结果拒绝接待是规则列举的不接待场景吗？",
		"PB-MT-FULFILLMENT-RESERVATION",
		REASON_FULFILLMENT_RESERVATION,
	),
	answerable(
		"JR-RAG-ANS-17",
		"商户装修歇业无法营业应该提前做什么告知？",
		"PB-MT-FULFILLMENT-CLOSURE",
		REASON_FULFILLMENT_CLOSURE,
	),
	answerable(
		"JR-RAG-ANS-18",
		"商家关门没提前设置团购不可用时间导致到店无法消费算什么？",
		"PB-MT-FULFILLMENT-CLOSURE",
		REASON_FULFILLMENT_CLOSURE,
	),
	answerable(
		"JR-RAG-ANS-19",
		"商户无法提供团购里的部分商品时替换方案的价值有什么要求？",
		"PB-MT-FULFILLMENT-ALTERNATIVE",
		REASON_FULFILLMENT_ALTERNATIVE,
	),
	answerable(
		"JR-RAG-ANS-20",
		"我不认可商户的替换方案商户应该怎么处理？",
		"PB-MT-FULFILLMENT-ALTERNATIVE",
		REASON_FULFILLMENT_ALTERNATIVE,
	),
	answerable(
		"JR-RAG-ANS-21",
		"大众点评普通团购券未消费时怎么申请退款？",
		"PB-DP-HELP-UNVERIFIED",
		REASON_DP_HELP_UNVERIFIED,
	),
	answerable(
		"JR-RAG-ANS-22",
		"已验证的美团券适用大众点评未消费退款帮助页吗？",
		"PB-DP-HELP-UNVERIFIED",
		REASON_DP_HELP_UNVERIFIED,
	),
	answerable("JR-RAG-ANS-23", "租户专属基准令牌A", "PB-MT-SCOPE-TENANT", REASON_SCOPE_TENANT, BENCHMARK_PROBE_SCOPE),
	answerable("JR-RAG-ANS-24", "门店专属基准令牌B", "PB-MT-SCOPE-STORE", REASON_SCOPE_STORE, BENCHMARK_PROBE_SCOPE),
];

// --- 8 no-answer synthetic isolation negative controls --------------------

const TENANT_B_SCOPE: Scope = { tenantId: "job-ready-tenant-b", storeId: "job-ready-store-a" };
const TENANT_C_SCOPE: Scope = { tenantId: "job-ready-tenant-c", storeId: "job-ready-store-a" };
const STORE_B_SCOPE: Scope = { tenantId: "job-ready-tenant-a", storeId: "job-ready-store-b" };
const STORE_C_SCOPE: Scope = { tenantId: "job-ready-tenant-a", storeId: "job-ready-store-c" };
const FIXTURE_SCOPE: Scope = { tenantId: "job-ready-tenant-a", storeId: "job-ready-store-a" };

const noAnswerCases: RetrievalEvalCase[] = [
	noAnswer("JR-RAG-NOANS-01", "合成租户隔离令牌甲", TENANT_B_SCOPE, REASON_NOANS_TENANT),
	noAnswer("JR-RAG-NOANS-02", "合成租户隔离令牌甲", TENANT_C_SCOPE, REASON_NOANS_TENANT),
	noAnswer("JR-RAG-NOANS-03", "合成门店隔离令牌乙", STORE_B_SCOPE, REASON_NOANS_STORE),
	noAnswer("JR-RAG-NOANS-04", "合成门店隔离令牌乙", STORE_C_SCOPE, REASON_NOANS_STORE),
	noAnswer("JR-RAG-NOANS-05", "合成未批准草稿令牌丙", FIXTURE_SCOPE, REASON_NOANS_UNAPPROVED),
	noAnswer("JR-RAG-NOANS-06", "合成测试专用令牌丁", FIXTURE_SCOPE, REASON_NOANS_SYNTHETIC_ONLY),
	noAnswer("JR-RAG-NOANS-07", "合成过期版本令牌戊", FIXTURE_SCOPE, REASON_NOANS_RETIRED),
	noAnswer("JR-RAG-NOANS-08", "合成废止条款令牌己", FIXTURE_SCOPE, REASON_NOANS_RETIRED),
];

// --- 8 ambiguous cases (>=2 distinct admissible plausible entries) --------

const ambiguousCases: RetrievalEvalCase[] = [
	ambiguous(
		"JR-RAG-AMB-01",
		"团购券没有消费过期了退款一般多久到账？",
		["PB-MT-UNCONSUMED-REFUND", "PB-MT-EXPIRED-AUTO-REFUND"],
		REASON_AMB_REFUND_TIMING,
	),
	ambiguous(
		"JR-RAG-AMB-02",
		"商户那边出了状况团购没法按原样提供可以退款吗？",
		["PB-MT-CHANGE-REFUND", "PB-MT-MERCHANT-CANNOT-FULFILL"],
		REASON_AMB_MERCHANT_CHANGE,
	),
	ambiguous(
		"JR-RAG-AMB-03",
		"到店以后商户拒绝接待这种情况怎么认定？",
		["PB-MT-FULFILLMENT-RESERVATION", "PB-MT-FULFILLMENT-CLOSURE"],
		REASON_AMB_FULFILLMENT_DENIED,
	),
	ambiguous(
		"JR-RAG-AMB-04",
		"商户提供不了团购里的项目该怎么接待或替换？",
		["PB-MT-FULFILLMENT-ALTERNATIVE", "PB-MT-MERCHANT-CANNOT-FULFILL"],
		REASON_AMB_PARTIAL_VS_NONE,
	),
	ambiguous(
		"JR-RAG-AMB-05",
		"团购券过期了还能用或者会退吗？",
		["PB-MT-VOUCHER-USE", "PB-MT-EXPIRED-AUTO-REFUND"],
		REASON_AMB_EXPIRED_HANDLING,
	),
	ambiguous(
		"JR-RAG-AMB-06",
		"消费相关的退款到底能不能退该找谁？",
		["PB-MT-AFTERSALES-CONTACT", "PB-MT-UNCONSUMED-REFUND"],
		REASON_AMB_CONSUMED_BOUNDARY,
	),
	ambiguous(
		"JR-RAG-AMB-07",
		"退款会退到哪里大概多久到账？",
		["PB-MT-REFUND-ORIGINAL-PAYMENT", "PB-MT-UNCONSUMED-REFUND"],
		REASON_AMB_REFUND_PATH_TIME,
	),
	ambiguous(
		"JR-RAG-AMB-08",
		"没验证没消费的团购券怎么退款？",
		["PB-DP-HELP-UNVERIFIED", "PB-MT-UNCONSUMED-REFUND"],
		REASON_AMB_UNVERIFIED_UNCONSUMED,
	),
];

/** The complete frozen population: exactly 40 cases in 24/8/8 order. */
export const jobReadyRetrievalCases: RetrievalEvalCase[] = [...answerableCases, ...noAnswerCases, ...ambiguousCases];

export type NegativeControlDimension = "tenant_isolation" | "store_isolation" | "unapproved_evidence" | "stale_version";

export interface NegativeControl {
	dimension: NegativeControlDimension;
	excludedEntryIds: string[];
}

/**
 * Explicit index of the negative controls. Eight no-answer cases cover all four
 * required dimensions (tenant/store isolation, unapproved evidence,
 * stale/version), each naming the synthetic fixture governance must exclude.
 */
export const NEGATIVE_CONTROLS: Readonly<Record<string, NegativeControl>> = {
	"JR-RAG-NOANS-01": { dimension: "tenant_isolation", excludedEntryIds: ["JR-FIX-TENANT-A"] },
	"JR-RAG-NOANS-02": { dimension: "tenant_isolation", excludedEntryIds: ["JR-FIX-TENANT-A"] },
	"JR-RAG-NOANS-03": { dimension: "store_isolation", excludedEntryIds: ["JR-FIX-STORE-A"] },
	"JR-RAG-NOANS-04": { dimension: "store_isolation", excludedEntryIds: ["JR-FIX-STORE-A"] },
	"JR-RAG-NOANS-05": { dimension: "unapproved_evidence", excludedEntryIds: ["JR-FIX-UNAPPROVED-DRAFT"] },
	"JR-RAG-NOANS-06": { dimension: "unapproved_evidence", excludedEntryIds: ["JR-FIX-SYNTHETIC-ONLY"] },
	"JR-RAG-NOANS-07": { dimension: "stale_version", excludedEntryIds: ["JR-FIX-RETIRED-V1"] },
	"JR-RAG-NOANS-08": { dimension: "stale_version", excludedEntryIds: ["JR-FIX-RETIRED-V2"] },
};
