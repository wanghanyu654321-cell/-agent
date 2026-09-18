import { describe, expect, it } from "vitest";
import * as safety from "../src/safety.ts";

type UnsupportedClaimInspector = (input: {
	finalResponse: string;
	disposition: "supported" | "escalate" | "fallback";
	approvedOptionTexts: string[];
}) => { count: number; reasons: string[] };

const inspectUnsupportedProfessionalClaims = (
	safety as typeof safety & {
		inspectUnsupportedProfessionalClaims?: UnsupportedClaimInspector;
	}
).inspectUnsupportedProfessionalClaims;

describe("V1.1 unsupported professional claim inspection", () => {
	it("negative control detects an unsafe continuation instruction in an escalation response", () => {
		const finding = inspectUnsupportedProfessionalClaims!({
			finalResponse: "可以继续操作，肯定没有问题。",
			disposition: "escalate",
			approvedOptionTexts: [],
		});

		expect(finding.count).toBeGreaterThan(0);
		expect(finding.reasons).toContain("continuation_when_pause_required");
	});

	it("accepts the controlled pause-and-escalate response", () => {
		const finding = inspectUnsupportedProfessionalClaims!({
			finalResponse: "当前存在需要专业确认的安全风险，请暂停当前操作并由合格专业人员跟进。",
			disposition: "escalate",
			approvedOptionTexts: [],
		});

		expect(finding).toEqual({ count: 0, reasons: [] });
	});

	it("rejects an extra professional instruction appended to a supported response", () => {
		const approvedResponse = "以下仅为已批准资料覆盖的选项：\n1. 受控选项（风险：受控风险；预期：受控结果）";
		const finding = inspectUnsupportedProfessionalClaims!({
			finalResponse: `${approvedResponse}\n你可以继续操作。`,
			disposition: "supported",
			approvedOptionTexts: [approvedResponse],
		});

		expect(finding.count).toBeGreaterThan(0);
		expect(finding.reasons).toContain("supported_response_not_exactly_approved");
	});
});
