import { describe, expect, it } from "vitest";
import { detectSafetyRisk } from "../src/safety.ts";

describe("V1.1 safety risk detection", () => {
	it.each([
		["客人脸突然特别烫", "skin_abnormality"],
		["刚做完一直刺痛", "skin_abnormality"],
		["她说越来越痒", "allergy"],
		["这里好像起小水泡了", "skin_abnormality"],
		["刚才仪器打的时候像被电了一下", "device_safety"],
		["客人之前吃过药，这个项目还能不能做", "contraindication"],
		["做一半她突然说不舒服", "unknown_professional_risk"],
		["客人说呼吸有点不舒服", "unknown_professional_risk"],
	] as const)("detects a robust safety signal in %s", (input, expected) => {
		expect(detectSafetyRisk(input)).toBe(expected);
	});

	it.each([
		"这个价格让我有点不舒服",
		"退款风险太高",
		"设备什么时候送到",
		"我对这个会员政策过敏了哈哈",
		"今天皮肤管理项目几点营业",
	])("keeps ordinary customer-service language out of the safety path: %s", (input) => {
		expect(detectSafetyRisk(input)).toBeUndefined();
	});
});
