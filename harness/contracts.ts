import type { EnterpriseSupportPort } from "../src/enterprise/business.ts";
import type { SupportAgentLimits, SupportResult } from "../src/index.ts";
import type { KnowledgeEntry } from "../src/knowledge.ts";

export type HarnessService = Pick<EnterpriseSupportPort, "respond">;

/** Trusted offline fixtures use the existing service's context and input contracts. */
export interface HarnessCase {
	caseId: string;
	context: Parameters<HarnessService["respond"]>[0];
	input: Parameters<HarnessService["respond"]>[1];
}

export interface HarnessSuite {
	suiteId: string;
	cases: HarnessCase[];
}

/** Composition-owned declarations, not introspection of the supplied service. */
export interface RunConfig {
	sourceCommit: string;
	sourceTree: string;
	runtimeMode: "deterministic";
	provider: string;
	model: string;
	retrievalStrategy: "lexical" | "fake";
	embeddingProfile: null;
	limits: SupportAgentLimits;
	toolExecution: "sequential";
}

export interface RunInputs {
	suite: HarnessSuite;
	config: RunConfig;
	/** Null means unobserved corpus; a known empty corpus is []. Never export its contents. */
	corpus: readonly KnowledgeEntry[] | null;
}

export interface RunDeclaration {
	runId: string;
	suiteId: string;
	suiteHash: string;
	configHash: string;
	corpusHash: string;
	config: RunConfig;
	expectedCaseIds: string[];
}

/** No transcript, result text, Pi session ID or raw events enter this projection. */
export type CaseMeasurement = {
	caseId: string;
	/** SupportResult cannot distinguish a caught retrieval error from zero matches. */
	retrievalStatus: "unverified";
} & (
	| {
			finalResult: SupportResult["type"];
			evidence: SupportResult["evidence"];
			/** Runtime attempts, NOT Pi-emitted events or proof of durable business writes. */
			attemptedOperations: SupportResult["toolsCalled"];
	  }
	| {
			finalResult: "execution_error";
			/** No SupportResult was observed, so empty successful evidence cannot be inferred. */
			evidence: null;
			attemptedOperations: null;
			errorCategory: "service_error";
	  }
);

export interface HarnessRun {
	declaration: RunDeclaration;
	measurements: CaseMeasurement[];
	/** Complete means all calls returned, never quality PASS or successful retrieval. */
	completionState: "complete" | "incomplete";
	completionMarker: { measurementHash: string } | null;
}

/** Retain separately from editable reports; not a signature or an authenticity claim. */
export interface RunReceipt {
	runHash: string;
}

export interface IntegrityEvaluation {
	integrity: "verified" | "failed";
	completionState: "complete" | "incomplete";
	issues: string[];
	quality: "not_evaluated";
}

/** A declared final runtime outcome; it is evaluated only from CaseMeasurement.finalResult. */
export type OutcomeExpectation =
	| { finalResult: CaseMeasurement["finalResult"] }
	| "not_required";

/** A declared reference requirement; it is evaluated only from CaseMeasurement.evidence. */
export type EvidenceRequirement = Exclude<CaseMeasurement["evidence"], null>[number];

export type EvidenceExpectation =
	| { required: readonly EvidenceRequirement[] }
	| "not_required";

export type DurableStateExpectation =
	| {
			kind: "ticket";
			tenantId: string;
			storeId: string;
			conversationId: string;
			idempotencyKey: string;
			count: 1;
	  }
	| {
			kind: "handoff";
			tenantId: string;
			storeId: string;
			conversationId: string;
			count: 1;
	  }
	| {
			kind: "no_write";
			tenantId: string;
			storeId: string;
			conversationId: string;
			count: 0;
	  }
	| { kind: "not_required" };

/**
 * An externally derived complete durable-state read for one case. Empty arrays
 * mean an observed empty result; a missing case observation is not the same thing.
 */
export interface DurableObservation {
	caseId: string;
	tickets: readonly {
		tenantId: string;
		storeId: string;
		conversationId: string;
		idempotencyKey: string;
	}[];
	handoffs: readonly {
		tenantId: string;
		storeId: string;
		conversationId: string;
	}[];
}

export interface AcceptanceExpectation {
	caseId: string;
	outcome: OutcomeExpectation;
	evidence: EvidenceExpectation;
	durableState: DurableStateExpectation;
}

export type AcceptanceDimensionStatus = "pass" | "fail" | "not_required";

export interface AcceptanceCaseEvaluation {
	caseId: string;
	outcome: AcceptanceDimensionStatus;
	evidence: AcceptanceDimensionStatus;
	durableState: AcceptanceDimensionStatus;
}

export interface AcceptanceEvaluation {
	acceptance: "pass" | "fail";
	cases: AcceptanceCaseEvaluation[];
	issues: string[];
}
