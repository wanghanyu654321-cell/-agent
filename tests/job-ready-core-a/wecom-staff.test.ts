import { describe, expect, it } from "vitest";
import { staffCustomerText } from "../../src/channels/wecom/staff.ts";

describe("Staff booking customer wording", () => {
	it("states intent confirmation without claiming capacity or payment", () => {
		const text = staffCustomerText("confirmed", "2026-10-01T10:00:00.000Z");
		expect(text).toContain("已确认您的预约意向");
		expect(text).toContain("2026-10-01T10:00:00.000Z");
		expect(text).not.toMatch(/预约成功|位置已锁定|保证有空位|支付完成/);
	});
	it("renders cancellation and rejects unsupported states", () => {
		expect(staffCustomerText("cancelled", null)).toContain("已取消");
		expect(() => staffCustomerText("pending_confirmation", null)).toThrow();
		expect(() => staffCustomerText("confirmed", null)).toThrow();
	});
});
