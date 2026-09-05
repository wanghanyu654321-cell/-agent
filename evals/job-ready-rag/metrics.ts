import { jobReadyCorpus } from "./corpus.ts";
import type {
	ActualAnswerability,
	CaseProvenance,
	CorpusEntry,
	ExpectedAnswerability,
	RetrievalEvalCase,
	RetrievalMeasurement,
	RetrievalMode,
	Scope,
} from "./schema.ts";

/**
 * Deterministic retrieval-eval scoring (contract section 10). Everything here is
 * recomputed from the raw measurement fields against the frozen case + corpus;
 * a run's own `pass` flag is never trusted blindly.
 *
 * Two metric classes are kept strictly separate:
 * - Ranked/quality metrics (Recall@3, Wrong Evidence Rate, routing accuracy,
 *   latency) are reported as numbers with NO acceptance threshold, because
 *   CONTRACT GAP-05 (final quality thresholds + calibration/holdout split) is
 *   unresolved. Nothing here may label an overall Job-Ready PASS.
 * - Hard security invariants (zero cross-scope / unapproved / stale-version
 *   admission, zero ordinary authorization on 0/2+) are mandatory and are not
 *   tunable thresholds.
 */

export type RoutingBucket = "0" | "1" | "2+";

export const GAP05_NOTE =
	"CONTRACT GAP-05 unresolved: final numerical retrieval-quality acceptance thresholds and the calibration/holdout split are not independently approved. No measured percentage in this report may be labelled an overall Job-Ready PASS. Hard scope/status/version/authorization safety invariants remain mandatory and are reported separately.";

/** Mirror of `knowledgeScopeAllows` for a defined tenant/store scope. */
export function scopeAllowsEntry(entry: CorpusEntry, scope: Scope): boolean {
	if (entry.tenantScope !== undefined && entry.tenantScope !== scope.tenantId) return false;
	if (entry.storeScope !== undefined && entry.storeScope !== scope.storeId) return false;
	return true;
}

export function bucketForExpected(answerability: ExpectedAnswerability): RoutingBucket {
	if (answerability === "no_answer") return "0";
	if (answerability === "ambiguous") return "2+";
	return "1";
}

export function bucketForCount(admittedCount: number): RoutingBucket {
	if (admittedCount <= 0) return "0";
	if (admittedCount === 1) return "1";
	return "2+";
}

function distinct(ids: readonly string[]): string[] {
	const seen: string[] = [];
	for (const id of ids) if (!seen.includes(id)) seen.push(id);
	return seen;
}

export interface CaseEvaluation {
	caseId: string;
	missing: boolean;
	mode: RetrievalMode | "none";
	provenance: CaseProvenance;
	expectedAnswerability: ExpectedAnswerability;
	actualAnswerability: ActualAnswerability | "none";
	expectedRoutingBucket: RoutingBucket;
	actualRoutingBucket: RoutingBucket;
	routingCorrect: boolean;
	elapsedMs: number | null;
	errored: boolean;
	timedOut: boolean;
	errorCategory?: string;
	dependencyFailure: boolean;
	hasGold: boolean;
	recallAt3: number | null;
	recallHitIds: string[];
	recallMissedIds: string[];
	returnedDistinctIds: string[];
	wrongDistinctIds: string[];
	noAnswerEligible: boolean;
	noAnswerCorrect: boolean;
	crossScopeAdmissions: string[];
	unapprovedAdmissions: string[];
	staleVersionAdmissions: string[];
	unknownAdmissions: string[];
	ordinaryAuthorizationOnZeroOrMultiple: boolean;
	failureReasons: string[];
	pass: boolean;
}

function isValidGold(
	id: string,
	evalCase: RetrievalEvalCase,
	measurement: RetrievalMeasurement,
	corpusById: ReadonlyMap<string, CorpusEntry>,
): boolean {
	if (!evalCase.expectedEvidenceIds.includes(id)) return false;
	const entry = corpusById.get(id);
	if (!entry) return false;
	if (!scopeAllowsEntry(entry, evalCase.scope)) return false;
	// Version must be recorded and match: IDs alone are never sufficient.
	return measurement.returnedVersions[id] === evalCase.expectedVersions[id];
}

export function evaluateCase(
	measurement: RetrievalMeasurement | undefined,
	evalCase: RetrievalEvalCase,
	corpusById: ReadonlyMap<string, CorpusEntry>,
): CaseEvaluation {
	const expectedRoutingBucket = bucketForExpected(evalCase.expectedAnswerability);
	const hasGold = evalCase.expectedEvidenceIds.length > 0;

	if (!measurement) {
		return {
			caseId: evalCase.caseId,
			missing: true,
			mode: "none",
			provenance: evalCase.provenance,
			expectedAnswerability: evalCase.expectedAnswerability,
			actualAnswerability: "none",
			expectedRoutingBucket,
			actualRoutingBucket: "0",
			routingCorrect: false,
			elapsedMs: null,
			errored: true,
			timedOut: false,
			dependencyFailure: true,
			hasGold,
			recallAt3: null,
			recallHitIds: [],
			recallMissedIds: [...evalCase.expectedEvidenceIds],
			returnedDistinctIds: [],
			wrongDistinctIds: [],
			noAnswerEligible: evalCase.expectedAnswerability === "no_answer",
			noAnswerCorrect: false,
			crossScopeAdmissions: [],
			unapprovedAdmissions: [],
			staleVersionAdmissions: [],
			unknownAdmissions: [],
			ordinaryAuthorizationOnZeroOrMultiple: false,
			failureReasons: ["missing_measurement"],
			pass: false,
		};
	}

	const returnedDistinct = distinct(measurement.returnedEvidenceIds);
	const top3 = returnedDistinct.slice(0, 3);
	const admittedDistinct = distinct(measurement.admittedEvidenceIds);
	const dependencyFailure = measurement.actualAnswerability === "unavailable";
	const errored = dependencyFailure || measurement.errorCategory !== undefined;
	const timedOut =
		typeof measurement.errorCategory === "string" && measurement.errorCategory.toLowerCase().includes("timeout");
	const actualRoutingBucket = bucketForCount(admittedDistinct.length);
	const routingCorrect = !dependencyFailure && actualRoutingBucket === expectedRoutingBucket;

	const recallHitIds: string[] = [];
	const recallMissedIds: string[] = [];
	for (const id of evalCase.expectedEvidenceIds) {
		if (top3.includes(id) && isValidGold(id, evalCase, measurement, corpusById)) recallHitIds.push(id);
		else recallMissedIds.push(id);
	}
	const recallAt3 = hasGold ? recallHitIds.length / evalCase.expectedEvidenceIds.length : null;

	const wrongDistinctIds = returnedDistinct.filter((id) => !isValidGold(id, evalCase, measurement, corpusById));

	const noAnswerEligible = evalCase.expectedAnswerability === "no_answer";
	const noAnswerCorrect = noAnswerEligible && admittedDistinct.length === 0 && !errored && !dependencyFailure;

	const crossScopeAdmissions: string[] = [];
	const unapprovedAdmissions: string[] = [];
	const staleVersionAdmissions: string[] = [];
	const unknownAdmissions: string[] = [];
	for (const id of admittedDistinct) {
		const entry = corpusById.get(id);
		if (!entry) {
			unknownAdmissions.push(id);
			continue;
		}
		if (!scopeAllowsEntry(entry, evalCase.scope)) crossScopeAdmissions.push(id);
		if (entry.status !== "approved") unapprovedAdmissions.push(id);
		const returnedVersion = measurement.returnedVersions[id];
		if (entry.status === "retired" || (returnedVersion !== undefined && returnedVersion !== entry.version)) {
			staleVersionAdmissions.push(id);
		}
	}

	const ordinaryAuthorizationOnZeroOrMultiple =
		(evalCase.expectedAnswerability === "no_answer" || evalCase.expectedAnswerability === "ambiguous") &&
		measurement.actualAnswerability === "answerable";

	const failureReasons: string[] = [];
	if (dependencyFailure) failureReasons.push("dependency_failure");
	if (crossScopeAdmissions.length > 0) failureReasons.push(`cross_scope_admission:${crossScopeAdmissions.join("|")}`);
	if (unapprovedAdmissions.length > 0) failureReasons.push(`unapproved_admission:${unapprovedAdmissions.join("|")}`);
	if (staleVersionAdmissions.length > 0)
		failureReasons.push(`stale_version_admission:${staleVersionAdmissions.join("|")}`);
	if (unknownAdmissions.length > 0) failureReasons.push(`unknown_admission:${unknownAdmissions.join("|")}`);
	if (ordinaryAuthorizationOnZeroOrMultiple) failureReasons.push("ordinary_authorization_on_zero_or_multiple");
	if (!routingCorrect && !dependencyFailure) {
		failureReasons.push(`routing_mismatch:expected_${expectedRoutingBucket}_got_${actualRoutingBucket}`);
	}

	return {
		caseId: evalCase.caseId,
		missing: false,
		mode: measurement.mode,
		provenance: evalCase.provenance,
		expectedAnswerability: evalCase.expectedAnswerability,
		actualAnswerability: measurement.actualAnswerability,
		expectedRoutingBucket,
		actualRoutingBucket,
		routingCorrect,
		elapsedMs: measurement.elapsedMs,
		errored,
		timedOut,
		...(measurement.errorCategory !== undefined ? { errorCategory: measurement.errorCategory } : {}),
		dependencyFailure,
		hasGold,
		recallAt3,
		recallHitIds,
		recallMissedIds,
		returnedDistinctIds: returnedDistinct,
		wrongDistinctIds,
		noAnswerEligible,
		noAnswerCorrect,
		crossScopeAdmissions,
		unapprovedAdmissions,
		staleVersionAdmissions,
		unknownAdmissions,
		ordinaryAuthorizationOnZeroOrMultiple,
		failureReasons,
		pass: failureReasons.length === 0,
	};
}

export interface LatencyStats {
	count: number;
	min: number | null;
	p50: number | null;
	p95: number | null;
	max: number | null;
	timeoutCount: number;
	errorCount: number;
}

export interface RecallStratum {
	cases: number;
	macroRecallAt3: number | null;
}

export interface SafetyInvariants {
	crossScopeAdmissions: number;
	unapprovedAdmissions: number;
	staleVersionAdmissions: number;
	unknownAdmissions: number;
	ordinaryAuthorizationOnZeroOrMultiple: number;
	violatingCaseIds: string[];
	allHold: boolean;
}

export interface MetricsSummary {
	mode: RetrievalMode | "mixed" | "none";
	caseCount: number;
	measurementCount: number;
	recallAnswerable: RecallStratum;
	recallAmbiguous: RecallStratum;
	wrongEvidenceRate: number | null;
	wrongEvidenceReturnedDistinct: number;
	wrongEvidenceWrongDistinct: number;
	coverage: number | null;
	noAnswerAccuracy: number | null;
	noAnswerCorrect: number;
	noAnswerTotal: number;
	latency: LatencyStats;
	routingAccuracy: number | null;
	routingBuckets: Record<RoutingBucket, { expected: number; correct: number }>;
	dependencyFailureCount: number;
	passedCaseCount: number;
	failedCaseIds: string[];
	safetyInvariants: SafetyInvariants;
	gap05: { status: "unresolved"; note: string };
}

function percentile(sortedAscending: readonly number[], p: number): number | null {
	if (sortedAscending.length === 0) return null;
	const rank = Math.ceil((p / 100) * sortedAscending.length);
	const index = Math.min(Math.max(rank - 1, 0), sortedAscending.length - 1);
	return sortedAscending[index];
}

function macroRecall(evaluations: readonly CaseEvaluation[], answerability: ExpectedAnswerability): RecallStratum {
	const stratum = evaluations.filter(
		(item) => item.expectedAnswerability === answerability && item.recallAt3 !== null,
	);
	if (stratum.length === 0) return { cases: 0, macroRecallAt3: null };
	const total = stratum.reduce((sum, item) => sum + (item.recallAt3 ?? 0), 0);
	return { cases: stratum.length, macroRecallAt3: total / stratum.length };
}

export function computeMetrics(evaluations: readonly CaseEvaluation[]): MetricsSummary {
	const modes = new Set(evaluations.filter((item) => !item.missing).map((item) => item.mode));
	const mode: MetricsSummary["mode"] = modes.size === 1 ? [...modes][0] : modes.size === 0 ? "none" : "mixed";

	const measured = evaluations.filter((item) => !item.missing);
	const latencies = measured.map((item) => item.elapsedMs ?? 0).sort((a, b) => a - b);

	const returnedDistinctTotal = evaluations.reduce((sum, item) => sum + item.returnedDistinctIds.length, 0);
	const wrongDistinctTotal = evaluations.reduce((sum, item) => sum + item.wrongDistinctIds.length, 0);
	const casesWithAnyReturn = evaluations.filter((item) => item.returnedDistinctIds.length > 0).length;

	const noAnswerEvals = evaluations.filter((item) => item.noAnswerEligible);
	const noAnswerCorrect = noAnswerEvals.filter((item) => item.noAnswerCorrect).length;

	const routingBuckets: Record<RoutingBucket, { expected: number; correct: number }> = {
		"0": { expected: 0, correct: 0 },
		"1": { expected: 0, correct: 0 },
		"2+": { expected: 0, correct: 0 },
	};
	for (const item of evaluations) {
		routingBuckets[item.expectedRoutingBucket].expected += 1;
		if (item.routingCorrect) routingBuckets[item.expectedRoutingBucket].correct += 1;
	}
	const routingCorrectTotal = evaluations.filter((item) => item.routingCorrect).length;

	const violatingCaseIds = evaluations
		.filter(
			(item) =>
				item.crossScopeAdmissions.length > 0 ||
				item.unapprovedAdmissions.length > 0 ||
				item.staleVersionAdmissions.length > 0 ||
				item.unknownAdmissions.length > 0 ||
				item.ordinaryAuthorizationOnZeroOrMultiple,
		)
		.map((item) => item.caseId);

	const safetyInvariants: SafetyInvariants = {
		crossScopeAdmissions: evaluations.reduce((sum, item) => sum + item.crossScopeAdmissions.length, 0),
		unapprovedAdmissions: evaluations.reduce((sum, item) => sum + item.unapprovedAdmissions.length, 0),
		staleVersionAdmissions: evaluations.reduce((sum, item) => sum + item.staleVersionAdmissions.length, 0),
		unknownAdmissions: evaluations.reduce((sum, item) => sum + item.unknownAdmissions.length, 0),
		ordinaryAuthorizationOnZeroOrMultiple: evaluations.filter((item) => item.ordinaryAuthorizationOnZeroOrMultiple)
			.length,
		violatingCaseIds,
		allHold: violatingCaseIds.length === 0,
	};

	return {
		mode,
		caseCount: evaluations.length,
		measurementCount: measured.length,
		recallAnswerable: macroRecall(evaluations, "answerable"),
		recallAmbiguous: macroRecall(evaluations, "ambiguous"),
		wrongEvidenceRate: returnedDistinctTotal === 0 ? null : wrongDistinctTotal / returnedDistinctTotal,
		wrongEvidenceReturnedDistinct: returnedDistinctTotal,
		wrongEvidenceWrongDistinct: wrongDistinctTotal,
		coverage: evaluations.length === 0 ? null : casesWithAnyReturn / evaluations.length,
		noAnswerAccuracy: noAnswerEvals.length === 0 ? null : noAnswerCorrect / noAnswerEvals.length,
		noAnswerCorrect,
		noAnswerTotal: noAnswerEvals.length,
		latency: {
			count: latencies.length,
			min: latencies.length === 0 ? null : latencies[0],
			p50: percentile(latencies, 50),
			p95: percentile(latencies, 95),
			max: latencies.length === 0 ? null : latencies[latencies.length - 1],
			timeoutCount: measured.filter((item) => item.timedOut).length,
			errorCount: measured.filter((item) => item.errored).length,
		},
		routingAccuracy: evaluations.length === 0 ? null : routingCorrectTotal / evaluations.length,
		routingBuckets,
		dependencyFailureCount: evaluations.filter((item) => item.dependencyFailure).length,
		passedCaseCount: evaluations.filter((item) => item.pass).length,
		failedCaseIds: evaluations.filter((item) => !item.pass).map((item) => item.caseId),
		safetyInvariants,
		gap05: { status: "unresolved", note: GAP05_NOTE },
	};
}

/**
 * Score one single-mode run against the frozen population. Every population case
 * is evaluated; a case without a measurement is marked missing and failed so an
 * incomplete run can never masquerade as a complete, healthy result.
 */
export function scoreRun(
	cases: readonly RetrievalEvalCase[],
	measurements: readonly RetrievalMeasurement[],
	corpus: readonly CorpusEntry[] = jobReadyCorpus,
): { evaluations: CaseEvaluation[]; metrics: MetricsSummary } {
	const corpusById = new Map(corpus.map((entry) => [entry.id, entry]));
	const measurementByCase = new Map<string, RetrievalMeasurement>();
	for (const measurement of measurements) {
		if (measurementByCase.has(measurement.caseId)) {
			throw new Error(`Duplicate measurement for caseId ${measurement.caseId}; score one mode per run.`);
		}
		measurementByCase.set(measurement.caseId, measurement);
	}
	const evaluations = cases.map((item) => evaluateCase(measurementByCase.get(item.caseId), item, corpusById));
	return { evaluations, metrics: computeMetrics(evaluations) };
}
