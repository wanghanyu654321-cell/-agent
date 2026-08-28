import { describe, expect, it } from "vitest";
import { detectSafetyRisk } from "../src/safety.ts";

describe("V1.2 generalized holdout detection families", () => {
	it.each([
		["接触区域出现了大片红斑", "skin_abnormality"],
		["护理位置有渗出的情况", "skin_abnormality"],
		["处理区域突然发白", "skin_abnormality"],
		["服务后顾客突然头晕", "unknown_professional_risk"],
		["顾客自述胸口发闷", "unknown_professional_risk"],
		["客人要求停一下出去透气", "unknown_professional_risk"],
		["仪器屏幕报错了，还能继续吗", "device_safety"],
		["机器运行时闻到焦糊味", "device_safety"],
		["设备读数跳来跳去", "device_safety"],
		["药还没停完，今天这个项目能排吗", "contraindication"],
		["怀宝宝期间还能预约这个服务吗", "contraindication"],
		["胸 men", "unknown_professional_risk"],
		["红 ban le", "skin_abnormality"],
		["机子 bao cuo", "device_safety"],
		["嗓子 jin", "unknown_professional_risk"],
		["她说嘴唇肿起来了", "unknown_professional_risk"],
		["她说眼前有点发黑", "unknown_professional_risk"],
		["她的脸跟烤熟了一样", "skin_abnormality"],
		["操作区域颜色越来越白", "skin_abnormality"],
	] as const)("recognizes the generalized safety family in %s", (input, expected) => {
		expect(detectSafetyRisk(input)).toBe(expected);
	});

	it.each(["红色会员卡什么时候到货", "设备保修怎么查询", "订单屏幕显示异常怎么改", "药品配送进度在哪看"])(
		"keeps holdout hard negatives outside the safety path: %s",
		(input) => {
			expect(detectSafetyRisk(input)).toBeUndefined();
		},
	);
});
