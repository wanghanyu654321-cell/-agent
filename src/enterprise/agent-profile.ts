import { createHash } from "node:crypto";

export const AGENT_TOOL_NAMES = ["search_faq", "search_knowledge", "create_ticket", "handoff_to_human"] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

export interface AgentProfile {
	id: string;
	version: string;
	identityPrompt: string;
	workPolicy: string;
	allowedSkills: readonly string[];
	allowedTools: readonly AgentToolName[];
}

export interface ResolvedAgentProfile extends AgentProfile {
	profileHash: string;
}

export class AgentProfileValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AgentProfileValidationError";
	}
}

export const DEFAULT_AGENT_PROFILE: AgentProfile = {
	id: "customer-support-agent",
	version: "v1",
	identityPrompt: "You are a customer-support agent.",
	workPolicy: "Use only the provided support tools.",
	allowedSkills: ["appointment", "complaint", "escalation", "greeting", "refund", "safety-escalation"],
	allowedTools: AGENT_TOOL_NAMES,
};

const requiredGroundingTools: readonly AgentToolName[] = ["search_faq", "search_knowledge"];

export function resolveAgentProfile(profile: AgentProfile = DEFAULT_AGENT_PROFILE): ResolvedAgentProfile {
	const id = requiredTrimmedText(profile.id, "id");
	const version = requiredTrimmedText(profile.version, "version");
	const identityPrompt = requiredPromptText(profile.identityPrompt, "identityPrompt");
	const workPolicy = requiredPromptText(profile.workPolicy, "workPolicy");
	const allowedSkills = normalizeSkills(profile.allowedSkills);
	const allowedTools = normalizeTools(profile.allowedTools);
	const profileHash = hashAgentProfile({ id, version, identityPrompt, workPolicy, allowedSkills, allowedTools });
	return Object.freeze({
		id,
		version,
		identityPrompt,
		workPolicy,
		allowedSkills: Object.freeze(allowedSkills),
		allowedTools: Object.freeze(allowedTools),
		profileHash,
	});
}

function requiredTrimmedText(value: unknown, field: "id" | "version"): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new AgentProfileValidationError(`Agent profile ${field} must be a non-empty string.`);
	}
	return value.trim();
}

function requiredPromptText(value: unknown, field: "identityPrompt" | "workPolicy"): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new AgentProfileValidationError(`Agent profile ${field} must be a non-empty string.`);
	}
	return value;
}

function normalizeSkills(value: readonly string[]): string[] {
	if (!Array.isArray(value)) throw new AgentProfileValidationError("Agent profile allowedSkills must be an array.");
	const allowedSkills = value.map((skill) => {
		if (typeof skill !== "string" || skill.trim().length === 0) {
			throw new AgentProfileValidationError("Agent profile allowedSkills must contain non-empty strings.");
		}
		return skill.trim();
	});
	if (new Set(allowedSkills).size !== allowedSkills.length) {
		throw new AgentProfileValidationError("Agent profile allowedSkills must be unique.");
	}
	return allowedSkills;
}

function normalizeTools(value: readonly AgentToolName[]): AgentToolName[] {
	if (!Array.isArray(value)) throw new AgentProfileValidationError("Agent profile allowedTools must be an array.");
	const allowedTools = value.map((tool) => {
		if (!AGENT_TOOL_NAMES.includes(tool)) {
			throw new AgentProfileValidationError("Agent profile allowedTools must contain only known tools.");
		}
		return tool;
	});
	if (new Set(allowedTools).size !== allowedTools.length) {
		throw new AgentProfileValidationError("Agent profile allowedTools must be unique.");
	}
	for (const tool of requiredGroundingTools) {
		if (!allowedTools.includes(tool)) {
			throw new AgentProfileValidationError(`Agent profile allowedTools must include ${tool}.`);
		}
	}
	return allowedTools;
}

function hashAgentProfile(profile: Omit<ResolvedAgentProfile, "profileHash">): string {
	const canonical = JSON.stringify({
		id: profile.id,
		version: profile.version,
		identityPrompt: profile.identityPrompt,
		workPolicy: profile.workPolicy,
		allowedSkills: [...profile.allowedSkills].sort(),
		allowedTools: [...profile.allowedTools].sort(),
	});
	return createHash("sha256").update(canonical).digest("hex");
}
