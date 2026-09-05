import type { KnowledgeKind, KnowledgeStatus } from "../../src/knowledge.ts";
import type { CorpusEntry, SyntheticIsolationFixture } from "./schema.ts";

/**
 * Frozen retrieval population for the Job-Ready RAG evaluation.
 *
 * Two explicitly distinguished sources (contract section 10):
 *
 * 1. `approvedPublicBenchmarkCorpus` — governance projections of the already
 *    approved public-benchmark entries. Full prose stays in the frozen source
 *    file below; only the identity/version/scope fields needed for deterministic
 *    scoring are mirrored here so `corpusSha256` binds the exact population.
 * 2. `syntheticIsolationFixtures` — non-production, clearly marked fixtures in
 *    full ingestable shape. They carry no real professional/beauty policy and no
 *    customer transcript. They MUST be ingested into the scoped corpus by
 *    Integration/Core B; an entry that is merely absent would make the
 *    tenant/store/approval/version negative controls meaningless.
 */

export const APPROVED_CORPUS_SOURCE_PATH = "knowledge/public-benchmark/approved/meituan-local-services-2026.json";

function approvedEntry(
	id: string,
	kind: KnowledgeKind,
	version: string,
	updatedAt: string,
	sourceRef: string,
	scope?: { tenantScope: string; storeScope: string },
): CorpusEntry {
	return {
		id,
		kind,
		status: "approved",
		version,
		updatedAt,
		sourceRef,
		provenance: "approved_public_benchmark",
		sourcePath: APPROVED_CORPUS_SOURCE_PATH,
		...(scope ? { tenantScope: scope.tenantScope, storeScope: scope.storeScope } : {}),
	};
}

const MEITUAN_TERMS = "https://rules-center.meituan.com/m/detail/guize/1?activeRule=1";
const MEITUAN_GUARANTEE = "https://rules-center.meituan.com/m/detail/guize/386003?activeRule=1";
const MEITUAN_FULFILLMENT = "https://rules-center.meituan.com/m/detail/guize/1174?activeRule=1";
const BENCHMARK_SCOPE = { tenantScope: "public-benchmark-tenant-a", storeScope: "public-benchmark-store-a" };

/** Governance projections of the 13 approved public-benchmark entries. */
export const approvedPublicBenchmarkCorpus: CorpusEntry[] = [
	approvedEntry("PB-MT-VOUCHER-USE", "policy", "mt-terms-1.6-2026-04-23", "2026-04-23", `${MEITUAN_TERMS}#section-7`),
	approvedEntry(
		"PB-MT-CHANGE-REFUND",
		"policy",
		"mt-terms-1.6-2026-04-23",
		"2026-04-23",
		`${MEITUAN_TERMS}#section-9.1`,
	),
	approvedEntry(
		"PB-MT-MERCHANT-CANNOT-FULFILL",
		"policy",
		"mt-terms-1.6-2026-04-23",
		"2026-04-23",
		`${MEITUAN_TERMS}#section-9.1`,
	),
	approvedEntry(
		"PB-MT-AFTERSALES-CONTACT",
		"policy",
		"mt-terms-1.6-2026-04-23",
		"2026-04-23",
		`${MEITUAN_TERMS}#section-9.2`,
	),
	approvedEntry(
		"PB-MT-REFUND-ORIGINAL-PAYMENT",
		"policy",
		"mt-terms-1.6-2026-04-23",
		"2026-04-23",
		`${MEITUAN_TERMS}#section-9.4`,
	),
	approvedEntry(
		"PB-MT-UNCONSUMED-REFUND",
		"policy",
		"mt-guarantee-2026-01-01",
		"2026-01-01",
		`${MEITUAN_GUARANTEE}#unconsumed-refund`,
	),
	approvedEntry(
		"PB-MT-EXPIRED-AUTO-REFUND",
		"policy",
		"mt-guarantee-2026-01-01",
		"2026-01-01",
		`${MEITUAN_GUARANTEE}#expired-auto-refund`,
	),
	approvedEntry(
		"PB-MT-FULFILLMENT-RESERVATION",
		"policy",
		"mt-fulfillment-2026-08-20",
		"2026-08-20",
		`${MEITUAN_FULFILLMENT}#reservation`,
	),
	approvedEntry(
		"PB-MT-FULFILLMENT-CLOSURE",
		"policy",
		"mt-fulfillment-2026-08-20",
		"2026-08-20",
		`${MEITUAN_FULFILLMENT}#closure`,
	),
	approvedEntry(
		"PB-MT-FULFILLMENT-ALTERNATIVE",
		"policy",
		"mt-fulfillment-2026-08-20",
		"2026-08-20",
		`${MEITUAN_FULFILLMENT}#alternative`,
	),
	approvedEntry(
		"PB-DP-HELP-UNVERIFIED",
		"faq",
		"dp-help-retrieved-2026-08-29",
		"2026-08-29",
		"https://kf.dianping.com/csCenter/app/questions/16403",
	),
	approvedEntry(
		"PB-MT-SCOPE-TENANT",
		"reference",
		"mt-scope-probe-2026-08-29",
		"2026-08-29",
		`${MEITUAN_TERMS}#section-7`,
		BENCHMARK_SCOPE,
	),
	approvedEntry(
		"PB-MT-SCOPE-STORE",
		"reference",
		"mt-store-probe-2026-08-29",
		"2026-08-29",
		`${MEITUAN_GUARANTEE}#unconsumed-refund`,
		BENCHMARK_SCOPE,
	),
];

const FIXTURE_VERSION = "jr-fixture-v1";
const FIXTURE_UPDATED_AT = "2026-09-05";
const FIXTURE_TENANT_SCOPE = "job-ready-tenant-a";
const FIXTURE_STORE_SCOPE = "job-ready-store-a";

function syntheticFixture(
	id: string,
	kind: KnowledgeKind,
	status: KnowledgeStatus,
	title: string,
	token: string,
	boundary: string,
): SyntheticIsolationFixture {
	return {
		id,
		kind,
		status,
		title,
		content: `合成隔离测试夹具（非生产知识，不代表任何真实门店、专业或美业政策，不含任何客户转录）：仅用于验证受治理检索在${boundary}边界之外不得准入。唯一识别令牌：${token}。`,
		version: FIXTURE_VERSION,
		updatedAt: FIXTURE_UPDATED_AT,
		tenantScope: FIXTURE_TENANT_SCOPE,
		storeScope: FIXTURE_STORE_SCOPE,
		sourceRef: `test://job-ready/synthetic/${id.toLowerCase()}`,
		tags: [token],
		provenance: "synthetic_isolation_fixture",
	};
}

/**
 * Six non-production fixtures covering the four negative-control dimensions.
 * All are scoped to the synthetic tenant/store so that scope, status and version
 * boundaries can each be exercised independently and deterministically.
 */
export const syntheticIsolationFixtures: SyntheticIsolationFixture[] = [
	syntheticFixture("JR-FIX-TENANT-A", "reference", "approved", "合成租户隔离夹具甲", "合成租户隔离令牌甲", "租户"),
	syntheticFixture("JR-FIX-STORE-A", "reference", "approved", "合成门店隔离夹具乙", "合成门店隔离令牌乙", "门店"),
	syntheticFixture(
		"JR-FIX-UNAPPROVED-DRAFT",
		"policy",
		"unapproved",
		"合成未批准草稿夹具丙",
		"合成未批准草稿令牌丙",
		"批准状态",
	),
	syntheticFixture(
		"JR-FIX-SYNTHETIC-ONLY",
		"faq",
		"synthetic_test_only",
		"合成测试专用夹具丁",
		"合成测试专用令牌丁",
		"测试专用状态",
	),
	syntheticFixture("JR-FIX-RETIRED-V1", "policy", "retired", "合成过期版本夹具戊", "合成过期版本令牌戊", "版本时效"),
	syntheticFixture("JR-FIX-RETIRED-V2", "policy", "retired", "合成废止条款夹具己", "合成废止条款令牌己", "版本时效"),
];

function fixtureToCorpusEntry(fixture: SyntheticIsolationFixture): CorpusEntry {
	return {
		id: fixture.id,
		kind: fixture.kind,
		status: fixture.status,
		version: fixture.version,
		updatedAt: fixture.updatedAt,
		sourceRef: fixture.sourceRef,
		...(fixture.tenantScope ? { tenantScope: fixture.tenantScope } : {}),
		...(fixture.storeScope ? { storeScope: fixture.storeScope } : {}),
		provenance: "synthetic_isolation_fixture",
	};
}

/**
 * The complete frozen population: approved projections plus synthetic fixture
 * projections. This is what `corpusSha256` hashes and what metrics consult for
 * scope/status/version violation detection.
 */
export const jobReadyCorpus: CorpusEntry[] = [
	...approvedPublicBenchmarkCorpus,
	...syntheticIsolationFixtures.map(fixtureToCorpusEntry),
];

const index = new Map<string, CorpusEntry>();
for (const entry of jobReadyCorpus) {
	if (index.has(entry.id)) throw new Error(`Duplicate corpus entry id: ${entry.id}.`);
	index.set(entry.id, entry);
}

export const corpusIndex: ReadonlyMap<string, CorpusEntry> = index;

/** Look up a frozen corpus entry by id, failing closed when it is unknown. */
export function getCorpusEntry(id: string): CorpusEntry {
	const entry = index.get(id);
	if (!entry) throw new Error(`Unknown corpus entry id: ${id}.`);
	return entry;
}
