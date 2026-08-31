import type { FaqEntry } from "./index.ts";
import type { KnowledgeEntry } from "./knowledge.ts";

export const portfolioDemoDataDisclaimer =
	"DEMO / SYNTHETIC PORTFOLIO DATA — NOT A REAL MERCHANT POLICY OR PRODUCTION KNOWLEDGE BASE.";

export const portfolioDemoFaq: FaqEntry[] = [
	{
		id: "demo-faq-business-hours",
		question: "营业时间",
		answer: "DEMO / SYNTHETIC PORTFOLIO DATA：门店每日 09:00-21:00 营业。",
		status: "synthetic_test_only",
		version: "demo-v1",
		sourceRef: "demo://portfolio/faq/business-hours",
	},
];

export const portfolioDemoKnowledge: KnowledgeEntry[] = [
	{
		id: "demo-policy-refund-timing",
		kind: "policy",
		status: "synthetic_test_only",
		title: "退款到账演示规则",
		content: "DEMO / SYNTHETIC PORTFOLIO DATA：退款申请在五个工作日内按演示规则处理。",
		version: "demo-v1",
		updatedAt: "2026-08-31",
		sourceRef: "demo://portfolio/policy/refund-timing",
		tags: ["退款", "到账"],
	},
	{
		id: "demo-policy-refund-rule-a",
		kind: "policy",
		status: "synthetic_test_only",
		title: "退款规则 A 演示候选",
		content: "DEMO / SYNTHETIC PORTFOLIO DATA：退款规则 A 仅用于展示多候选受控路由。",
		version: "demo-v1",
		updatedAt: "2026-08-31",
		sourceRef: "demo://portfolio/policy/refund-rule-a",
		tags: ["退款", "按哪个规则"],
	},
	{
		id: "demo-policy-refund-rule-b",
		kind: "policy",
		status: "synthetic_test_only",
		title: "退款规则 B 演示候选",
		content: "DEMO / SYNTHETIC PORTFOLIO DATA：退款规则 B 仅用于展示多候选受控路由。",
		version: "demo-v1",
		updatedAt: "2026-08-31",
		sourceRef: "demo://portfolio/policy/refund-rule-b",
		tags: ["退款", "按哪个规则"],
	},
];
