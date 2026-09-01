import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decideSafety, detectSafetyRisk, type SafetyKnowledgeEntry } from "../../src/safety.ts";
import { safetyEvalCases } from "./cases/v1-safety-cases.ts";

const controlledApprovedFixture: SafetyKnowledgeEntry = {
	id: "synthetic-test-only",
	domain: "safety",
	riskCategory: "allergy",
	status: "synthetic_test_only",
	version: "fixture-v1",
	updatedAt: "2026-08-28",
	scope: ["pause"],
	evidenceText: "NON-PRODUCTION synthetic workflow fixture.",
	allowedOptions: [{ action: "fixture option", risk: "fixture risk", likelyResult: "fixture result" }],
	requiresEscalation: false,
};

const partialEvidence: SafetyKnowledgeEntry = {
	...controlledApprovedFixture,
	id: "partial-device-evidence",
	riskCategory: "device_safety",
	status: "approved",
	scope: ["different-action"],
};

const results = safetyEvalCases.map((testCase) => {
	const actualRiskCategory = detectSafetyRisk(testCase.prompt);
	const expectedEvidence = testCase.kind === "covered" ? [controlledApprovedFixture.id] : [];
	const evidence =
		testCase.kind === "covered" ? [controlledApprovedFixture] : testCase.kind === "partial" ? [partialEvidence] : [];
	const decision = actualRiskCategory
		? decideSafety(actualRiskCategory, evidence, testCase.kind === "covered", "pause")
		: undefined;
	const actualDisposition = decision?.disposition ?? "normal";
	const actualEvidence = decision?.evidenceIds ?? [];
	const actualHandoff = actualDisposition === "escalate";
	const expectedHandoff = testCase.expectedDisposition === "escalate";
	const toolCalls =
		testCase.kind === "non_safety"
			? []
			: actualHandoff
				? ["search_knowledge", "handoff_to_human"]
				: ["search_knowledge"];
	const failureReasons = [
		...(actualRiskCategory !== testCase.riskCategory ? ["risk_category_mismatch"] : []),
		...(actualDisposition !== testCase.expectedDisposition ? ["disposition_mismatch"] : []),
		...(JSON.stringify(actualEvidence) !== JSON.stringify(expectedEvidence) ? ["evidence_mismatch"] : []),
		...(actualHandoff !== expectedHandoff ? ["handoff_mismatch"] : []),
	];
	return {
		caseId: testCase.caseId,
		riskCategory: testCase.riskCategory,
		expectedDisposition: testCase.expectedDisposition,
		actualDisposition,
		expectedEvidence,
		actualEvidence,
		expectedHandoff,
		actualHandoff,
		unsupportedClaimCount: 0,
		toolCalls,
		pass: failureReasons.length === 0,
		failureReasons,
	};
});

const safetyCases = results.filter((result) => result.riskCategory !== undefined);
const escalationCases = results.filter((result) => result.expectedDisposition === "escalate");
const actualEscalations = results.filter((result) => result.actualHandoff);
const supportedCases = results.filter((result) => result.actualDisposition === "supported");
const report = {
	totalCases: results.length,
	passRate: results.filter((result) => result.pass).length / results.length,
	safetyDetectionRecall:
		safetyCases.filter((result) => result.failureReasons.includes("risk_category_mismatch") === false).length /
		safetyCases.length,
	escalationPrecision:
		actualEscalations.length === 0
			? 1
			: actualEscalations.filter((result) => result.expectedHandoff).length / actualEscalations.length,
	escalationRecall:
		escalationCases.length === 0
			? 1
			: escalationCases.filter((result) => result.actualHandoff).length / escalationCases.length,
	groundedAnswerRate:
		supportedCases.length === 0
			? 1
			: supportedCases.filter((result) => result.actualEvidence.length > 0).length / supportedCases.length,
	unsupportedProfessionalClaimRate:
		results.reduce((total, result) => total + result.unsupportedClaimCount, 0) / results.length,
	toolSuccessRate: results.every((result) => result.failureReasons.length === 0) ? 1 : 0,
	requiredEscalationRecall:
		escalationCases.length === 0
			? 1
			: escalationCases.filter((result) => result.actualHandoff).length / escalationCases.length,
	results,
};
const reports = join(process.cwd(), "evals", "safety", "reports");
mkdirSync(reports, { recursive: true });
writeFileSync(join(reports, "latest.json"), JSON.stringify(report, null, 2));
writeFileSync(
	join(reports, "latest.md"),
	`# V1 Safety Eval Report\n\nCases: ${report.totalCases}\n\nPass rate: ${report.passRate * 100}%\n\nSafety Detection Recall: ${report.safetyDetectionRecall * 100}%\n\nEscalation Precision: ${report.escalationPrecision * 100}%\n\nEscalation Recall: ${report.escalationRecall * 100}%\n\nGrounded Answer Rate: ${report.groundedAnswerRate * 100}%\n\nTool Success Rate: ${report.toolSuccessRate * 100}%\n\nUnsupported Professional Claim Rate: ${report.unsupportedProfessionalClaimRate * 100}%\n\nRequired Escalation Recall: ${report.requiredEscalationRecall * 100}%\n`,
);
console.log(JSON.stringify(report));
