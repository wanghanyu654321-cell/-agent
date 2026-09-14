import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import type {
	AcceptanceEvaluation,
	AcceptanceExpectation,
	CaseMeasurement,
	DurableObservation,
	EvidenceRequirement,
	HarnessRun,
} from "../../harness/contracts.ts";
import * as evaluatorModule from "../../harness/evaluate.ts";
import {
	applyEnterpriseBusinessMigrations,
	PostgresEnterpriseBusinessRepository,
	PostgresIdentityRepository,
} from "../../src/enterprise/postgres.ts";
import type { SupportResult } from "../../src/index.ts";

type EvaluateAcceptance = (
	run: HarnessRun,
	expectations: readonly AcceptanceExpectation[],
	observations: readonly DurableObservation[],
) => AcceptanceEvaluation;

const scope = {
	tenantId: "acceptance-tenant",
	storeId: "acceptance-store",
	conversationId: "acceptance-conversation",
	idempotencyKey: "acceptance-ticket-key",
};
const requiredEvidence = [
	{ id: "policy-1", kind: "policy", version: "v1", sourceRef: "test://policy-1" },
] satisfies EvidenceRequirement[];

function evaluateAcceptance(): EvaluateAcceptance {
	const evaluator = Reflect.get(evaluatorModule, "evaluateAcceptance");
	expect(evaluator).toBeTypeOf("function");
	return evaluator as EvaluateAcceptance;
}

function run(measurements: CaseMeasurement[]): HarnessRun {
	return {
		declaration: {} as HarnessRun["declaration"],
		measurements,
		completionState: "complete",
		completionMarker: { measurementHash: "not-used-by-acceptance" },
	};
}

function measurement(
	caseId: string,
	finalResult: SupportResult["type"] = "answer",
	evidence: EvidenceRequirement[] = [],
	attemptedOperations: string[] = [],
): CaseMeasurement {
	return { caseId, finalResult, evidence, attemptedOperations, retrievalStatus: "unverified" };
}

function ticketExpectation(caseId: string): AcceptanceExpectation {
	return {
		caseId,
		outcome: { finalResult: "answer" },
		evidence: { required: requiredEvidence },
		durableState: { kind: "ticket", ...scope, count: 1 },
	};
}

function ticketObservation(
	caseId: string,
	overrides: Partial<DurableObservation["tickets"][number]> = {},
): DurableObservation {
	return {
		caseId,
		tickets: [{ ...scope, ...overrides }],
		handoffs: [],
	};
}

describe("Harness acceptance", () => {
	it("accepts a declared ticket outcome only with its exact durable ticket and evidence", () => {
		const caseId = "create-ticket";
		const result = evaluateAcceptance()(
			run([measurement(caseId, "answer", [...requiredEvidence], ["create_ticket"])]),
			[ticketExpectation(caseId)],
			[ticketObservation(caseId)],
		);

		expect(result).toEqual({
			acceptance: "pass",
			cases: [{ caseId, outcome: "pass", evidence: "pass", durableState: "pass" }],
			issues: [],
		});
	});

	it("accepts an idempotent duplicate ticket attempt only when the final matching count remains one", () => {
		const caseId = "idempotent-ticket";
		const result = evaluateAcceptance()(
			run([measurement(caseId, "answer", [...requiredEvidence], ["create_ticket", "create_ticket"])]),
			[ticketExpectation(caseId)],
			[ticketObservation(caseId)],
		);

		expect(result.cases[0]).toMatchObject({ outcome: "pass", evidence: "pass", durableState: "pass" });
		expect(result.acceptance).toBe("pass");
	});

	it("accepts a handoff only with one durable handoff in the exact scope", () => {
		const caseId = "handoff";
		const expectation: AcceptanceExpectation = {
			caseId,
			outcome: { finalResult: "escalation" },
			evidence: "not_required",
			durableState: {
				kind: "handoff",
				tenantId: scope.tenantId,
				storeId: scope.storeId,
				conversationId: scope.conversationId,
				count: 1,
			},
		};
		const result = evaluateAcceptance()(
			run([measurement(caseId, "escalation", [], ["handoff_to_human"])]),
			[expectation],
			[
				{
					caseId,
					tickets: [],
					handoffs: [{ tenantId: scope.tenantId, storeId: scope.storeId, conversationId: scope.conversationId }],
				},
			],
		);

		expect(result).toMatchObject({
			acceptance: "pass",
			cases: [{ caseId, outcome: "pass", evidence: "not_required", durableState: "pass" }],
		});
	});

	it("accepts a forbidden write only when an authoritative observed scope has no matching mutation", () => {
		const caseId = "forbidden-write";
		const result = evaluateAcceptance()(
			run([measurement(caseId, "fallback", [], ["create_ticket"])]),
			[
				{
					caseId,
					outcome: { finalResult: "fallback" },
					evidence: "not_required",
					durableState: {
						kind: "no_write",
						tenantId: scope.tenantId,
						storeId: scope.storeId,
						conversationId: scope.conversationId,
						count: 0,
					},
				},
			],
			[{ caseId, tickets: [], handoffs: [] }],
		);

		expect(result).toMatchObject({
			acceptance: "pass",
			cases: [{ caseId, outcome: "pass", evidence: "not_required", durableState: "pass" }],
		});
	});

	it("leaves normal knowledge answers durable-state not_required and ignores unrelated observations", () => {
		const caseId = "knowledge-answer";
		const result = evaluateAcceptance()(
			run([measurement(caseId, "answer", [...requiredEvidence])]),
			[
				{
					caseId,
					outcome: { finalResult: "answer" },
					evidence: { required: requiredEvidence },
					durableState: { kind: "not_required" },
				},
			],
			[ticketObservation("unrelated-business-write")],
		);

		expect(result).toEqual({
			acceptance: "pass",
			cases: [{ caseId, outcome: "pass", evidence: "pass", durableState: "not_required" }],
			issues: [],
		});
	});

	it("rejects an optimistic claimed ticket when toolsCalled and attemptedOperations are the only proof", () => {
		const caseId = "tool-only-ticket";
		const result = evaluateAcceptance()(
			run([measurement(caseId, "answer", [...requiredEvidence], ["create_ticket"])]),
			[ticketExpectation(caseId)],
			[{ caseId, tickets: [], handoffs: [] }],
		);

		expect(result.acceptance).toBe("fail");
		expect(result.cases[0]).toMatchObject({ outcome: "pass", evidence: "pass", durableState: "fail" });
		expect(result.issues).toContain(`durable_state_mismatch:${caseId}`);
	});

	it("rejects an optimistic ticket outcome when no durable ticket exists", () => {
		const caseId = "optimistic-without-ticket";
		const result = evaluateAcceptance()(
			run([measurement(caseId, "answer", [...requiredEvidence])]),
			[ticketExpectation(caseId)],
			[{ caseId, tickets: [], handoffs: [] }],
		);

		expect(result.acceptance).toBe("fail");
		expect(result.cases[0]).toMatchObject({ outcome: "pass", evidence: "pass", durableState: "fail" });
	});

	it("fails closed when required durable observation is missing", () => {
		const caseId = "missing-observation";
		const result = evaluateAcceptance()(
			run([measurement(caseId, "answer", [...requiredEvidence])]),
			[ticketExpectation(caseId)],
			[],
		);

		expect(result.acceptance).toBe("fail");
		expect(result.cases[0]?.durableState).toBe("fail");
		expect(result.issues).toContain(`durable_observation_missing:${caseId}`);
	});

	it.each([
		["tenantId", "wrong-tenant"],
		["storeId", "wrong-store"],
		["conversationId", "wrong-conversation"],
		["idempotencyKey", "wrong-idempotency-key"],
	] as const)("rejects a ticket durable observation with the wrong %s", (field, wrongValue) => {
		const caseId = `wrong-${field}`;
		const result = evaluateAcceptance()(
			run([measurement(caseId, "answer", [...requiredEvidence])]),
			[ticketExpectation(caseId)],
			[ticketObservation(caseId, { [field]: wrongValue })],
		);

		expect(result.acceptance).toBe("fail");
		expect(result.cases[0]?.durableState).toBe("fail");
	});

	it("rejects duplicate durable rows when a ticket expectation requires one final record", () => {
		const caseId = "duplicate-ticket";
		const observed = ticketObservation(caseId);
		const result = evaluateAcceptance()(
			run([measurement(caseId, "answer", [...requiredEvidence])]),
			[ticketExpectation(caseId)],
			[{ ...observed, tickets: [...observed.tickets, ...observed.tickets] }],
		);

		expect(result.acceptance).toBe("fail");
		expect(result.cases[0]?.durableState).toBe("fail");
	});

	it("rejects a declared evidence requirement that is absent from the measurement", () => {
		const caseId = "missing-evidence";
		const result = evaluateAcceptance()(
			run([measurement(caseId, "answer", [])]),
			[ticketExpectation(caseId)],
			[ticketObservation(caseId)],
		);

		expect(result.acceptance).toBe("fail");
		expect(result.cases[0]?.evidence).toBe("fail");
		expect(result.issues).toContain(`evidence_mismatch:${caseId}`);
	});

	it("rejects duplicate measurement, expectation, and durable observation mappings for required acceptance", () => {
		const caseId = "duplicate-case";
		const result = evaluateAcceptance()(
			run([
				measurement(caseId, "answer", [...requiredEvidence]),
				measurement(caseId, "answer", [...requiredEvidence]),
			]),
			[ticketExpectation(caseId), ticketExpectation(caseId)],
			[ticketObservation(caseId), ticketObservation(caseId)],
		);

		expect(result.acceptance).toBe("fail");
		expect(result.cases).toEqual([{ caseId, outcome: "fail", evidence: "fail", durableState: "fail" }]);
		expect(result.issues).toEqual(
			expect.arrayContaining([
				`duplicate_measurement_case:${caseId}`,
				`duplicate_expectation_case:${caseId}`,
				`duplicate_durable_observation:${caseId}`,
			]),
		);
	});

	it("does not mutate the run while evaluating acceptance", () => {
		const caseId = "immutable-run";
		const source = run([measurement(caseId, "answer", [...requiredEvidence])]);
		const before = structuredClone(source);

		evaluateAcceptance()(source, [ticketExpectation(caseId)], [ticketObservation(caseId)]);

		expect(source).toEqual(before);
	});
});

const postgresTestUrl = process.env.POSTGRES_TEST_URL;
const describePostgres = postgresTestUrl ? describe : describe.skip;

describePostgres("Harness acceptance durable observation from PostgreSQL", () => {
	const pool = new Pool({ connectionString: postgresTestUrl });
	const identity = new PostgresIdentityRepository(pool);
	const business = new PostgresEnterpriseBusinessRepository(pool);

	afterAll(async () => {
		await pool.end();
	});

	it("derives ticket and handoff observations from authoritative repository list reads", async () => {
		await applyEnterpriseBusinessMigrations(pool);
		const suffix = randomUUID();
		const postgresScope = {
			tenantId: `acceptance-tenant-${suffix}`,
			storeId: `acceptance-store-${suffix}`,
			ticketConversationId: `acceptance-ticket-conversation-${suffix}`,
			handoffConversationId: `acceptance-handoff-conversation-${suffix}`,
			idempotencyKey: `acceptance-ticket-key-${suffix}`,
		};
		const now = new Date();
		await identity.createTenant({ id: postgresScope.tenantId, name: "Harness acceptance tenant", createdAt: now });
		await identity.createStore({
			id: postgresScope.storeId,
			tenantId: postgresScope.tenantId,
			name: "Harness acceptance store",
			createdAt: now,
		});
		await business.createConversation({
			id: postgresScope.ticketConversationId,
			tenantId: postgresScope.tenantId,
			storeId: postgresScope.storeId,
			customerId: `acceptance-ticket-customer-${suffix}`,
			createdAt: now,
			updatedAt: now,
		});
		await business.createConversation({
			id: postgresScope.handoffConversationId,
			tenantId: postgresScope.tenantId,
			storeId: postgresScope.storeId,
			customerId: `acceptance-handoff-customer-${suffix}`,
			createdAt: now,
			updatedAt: now,
		});
		await business.createTicket({
			tenantId: postgresScope.tenantId,
			storeId: postgresScope.storeId,
			conversationId: postgresScope.ticketConversationId,
			summary: "Harness acceptance durable ticket",
			idempotencyKey: postgresScope.idempotencyKey,
		});
		await business.createTicket({
			tenantId: postgresScope.tenantId,
			storeId: postgresScope.storeId,
			conversationId: postgresScope.ticketConversationId,
			summary: "Harness acceptance idempotent duplicate",
			idempotencyKey: postgresScope.idempotencyKey,
		});
		await business.createHandoff({
			tenantId: postgresScope.tenantId,
			storeId: postgresScope.storeId,
			conversationId: postgresScope.handoffConversationId,
			reason: "Harness acceptance durable handoff",
		});

		const tickets = await business.listTickets(postgresScope.tenantId, postgresScope.storeId);
		const handoffs = await business.listHandoffs(postgresScope.tenantId, postgresScope.storeId);
		const observations: DurableObservation[] = [
			{
				caseId: "postgres-ticket",
				tickets: tickets.map(({ tenantId, storeId, conversationId, idempotencyKey }) => ({
					tenantId,
					storeId,
					conversationId,
					idempotencyKey,
				})),
				handoffs: handoffs.map(({ tenantId, storeId, conversationId }) => ({ tenantId, storeId, conversationId })),
			},
			{
				caseId: "postgres-handoff",
				tickets: tickets.map(({ tenantId, storeId, conversationId, idempotencyKey }) => ({
					tenantId,
					storeId,
					conversationId,
					idempotencyKey,
				})),
				handoffs: handoffs.map(({ tenantId, storeId, conversationId }) => ({ tenantId, storeId, conversationId })),
			},
		];
		const result = evaluateAcceptance()(
			run([measurement("postgres-ticket"), measurement("postgres-handoff", "escalation")]),
			[
				{
					caseId: "postgres-ticket",
					outcome: { finalResult: "answer" },
					evidence: "not_required",
					durableState: {
						kind: "ticket",
						tenantId: postgresScope.tenantId,
						storeId: postgresScope.storeId,
						conversationId: postgresScope.ticketConversationId,
						idempotencyKey: postgresScope.idempotencyKey,
						count: 1,
					},
				},
				{
					caseId: "postgres-handoff",
					outcome: { finalResult: "escalation" },
					evidence: "not_required",
					durableState: {
						kind: "handoff",
						tenantId: postgresScope.tenantId,
						storeId: postgresScope.storeId,
						conversationId: postgresScope.handoffConversationId,
						count: 1,
					},
				},
			],
			observations,
		);

		expect(result).toEqual({
			acceptance: "pass",
			cases: [
				{ caseId: "postgres-ticket", outcome: "pass", evidence: "not_required", durableState: "pass" },
				{ caseId: "postgres-handoff", outcome: "pass", evidence: "not_required", durableState: "pass" },
			],
			issues: [],
		});
	});
});
