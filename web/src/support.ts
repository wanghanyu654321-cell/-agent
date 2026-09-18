import type { SessionApi } from "./session.ts";

const resultTypes = new Set<PublicSupportResultType>(["answer", "fallback", "escalation"]);
const evidenceKinds = new Set<PublicEvidenceReference["kind"]>(["faq", "policy", "sop", "reference"]);
const customerFacingTools = new Set(["search_faq", "search_knowledge", "create_ticket", "handoff_to_human"]);

export type PublicSupportResultType = "answer" | "fallback" | "escalation";

export interface PublicEvidenceReference {
	id: string;
	version: string;
	sourceRef: string;
	kind: "faq" | "policy" | "sop" | "reference";
}

export interface PublicSupportResult {
	type: PublicSupportResultType;
	text: string;
	piSessionId: string;
	toolsCalled: string[];
	evidence: PublicEvidenceReference[];
}

export interface SupportRequestInput {
	conversationId: string;
	customerId: string;
	text: string;
}

export type SupportSubmissionOutcome =
	| { kind: "success"; result: PublicSupportResult }
	| { kind: "session-invalidated" }
	| { kind: "forbidden" }
	| { kind: "error"; message: string };

/** A request token prevents a late response from changing a cleared workspace. */
export class SupportRequestLifecycle {
	private activeRequest: number | undefined;
	private nextRequest = 0;

	begin(): number | undefined {
		if (this.activeRequest !== undefined) return undefined;
		const request = ++this.nextRequest;
		this.activeRequest = request;
		return request;
	}

	complete(request: number): boolean {
		if (this.activeRequest !== request) return false;
		this.activeRequest = undefined;
		return true;
	}

	invalidate(): void {
		this.nextRequest += 1;
		this.activeRequest = undefined;
	}
}

export async function submitSupportRequest(
	api: SessionApi,
	input: SupportRequestInput,
): Promise<SupportSubmissionOutcome> {
	let response: Response;
	try {
		response = await api.request("/api/v1/support/respond", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				conversationId: input.conversationId,
				customerId: input.customerId,
				text: input.text,
			}),
		});
	} catch {
		return { kind: "error", message: "Unable to complete the support request. Try again." };
	}

	if (response.status === 401) return { kind: "session-invalidated" };
	if (response.status === 403) return { kind: "forbidden" };
	if (!response.ok) return { kind: "error", message: "Unable to complete the support request. Try again." };

	let value: unknown;
	try {
		value = await response.json();
	} catch {
		return { kind: "error", message: "The support result could not be verified." };
	}
	const result = parsePublicSupportResult(value);
	return result
		? { kind: "success", result }
		: { kind: "error", message: "The support result could not be verified." };
}

export function parsePublicSupportResult(value: unknown): PublicSupportResult | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const result = value as Partial<PublicSupportResult>;
	const resultType = result.type;
	if (!resultTypes.has(resultType as PublicSupportResultType)) return undefined;
	if (typeof result.text !== "string" || typeof result.piSessionId !== "string") return undefined;
	if (!Array.isArray(result.toolsCalled) || result.toolsCalled.some((tool) => typeof tool !== "string" || !customerFacingTools.has(tool))) {
		return undefined;
	}
	if (!Array.isArray(result.evidence) || result.evidence.some((reference) => !isPublicEvidenceReference(reference))) {
		return undefined;
	}
	return {
		type: resultType as PublicSupportResultType,
		text: result.text,
		piSessionId: result.piSessionId,
		toolsCalled: [...result.toolsCalled],
		evidence: result.evidence.map((reference) => ({ ...reference })),
	};
}

function isPublicEvidenceReference(value: unknown): value is PublicEvidenceReference {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const reference = value as Partial<PublicEvidenceReference>;
	return (
		typeof reference.id === "string" &&
		typeof reference.version === "string" &&
		typeof reference.sourceRef === "string" &&
		evidenceKinds.has(reference.kind as PublicEvidenceReference["kind"])
	);
}
