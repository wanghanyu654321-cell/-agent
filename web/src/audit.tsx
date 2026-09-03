import type { ReactNode } from "react";
import type { SessionApi } from "./session.ts";

const publicAuditTools = ["search_faq", "search_knowledge", "create_ticket", "handoff_to_human"] as const;
const publicAuditOutcomes = ["answer", "fallback", "escalation"] as const;

export interface ScopedAuditEvent {
	id: string;
	tenantId: string;
	storeId: string;
	conversationId: string;
	eventType: "support-agent.audit";
	outcome?: (typeof publicAuditOutcomes)[number];
	toolsCalled: Array<(typeof publicAuditTools)[number]>;
	createdAt: string;
}

export type AuditProofOutcome =
	| { kind: "success"; events: ScopedAuditEvent[] }
	| { kind: "session-invalidated" }
	| { kind: "forbidden" }
	| { kind: "error"; message: string };

export type AuditProofState =
	| { status: "loading" }
	| { status: "unavailable" }
	| { status: "verified"; events: ScopedAuditEvent[] };

export class AuditReadLifecycle {
	private active = 0;

	begin(): number {
		this.active += 1;
		return this.active;
	}

	complete(request: number): boolean {
		return this.active === request;
	}

	invalidate(): void {
		this.active += 1;
	}
}

export function shouldLoadAuditProof(capabilities: readonly string[]): boolean {
	return capabilities.includes("audit:read");
}

export async function loadScopedAuditProof(
	api: SessionApi,
	scope: { tenantId: string; storeId: string },
): Promise<AuditProofOutcome> {
	let response: Response;
	try {
		response = await api.request("/api/v1/audit-events");
	} catch {
		return unavailable();
	}
	if (response.status === 401) return { kind: "session-invalidated" };
	if (response.status === 403) return { kind: "forbidden" };
	if (!response.ok) return unavailable();
	try {
		const events = parseAuditEvents(await response.json(), scope);
		return events ? { kind: "success", events } : unavailable();
	} catch {
		return unavailable();
	}
}

export function AuditProofSurface({ state }: { state: AuditProofState }) {
	if (state.status === "loading") return <AuditSurface><p>Loading durable Audit state…</p></AuditSurface>;
	if (state.status === "unavailable") return <AuditSurface><p>Durable Audit state could not be verified.</p></AuditSurface>;
	return <AuditSurface>
		{state.events.length === 0 ? <p>No durable Audit events verified.</p> : <ul>{state.events.map((event) => <li key={event.id}>
			<strong>{event.id}</strong>
			<span>{event.conversationId}</span>
			{event.outcome ? <span>{event.outcome}</span> : null}
			<span>{event.toolsCalled.join(", ") || "No approved customer-facing tools"}</span>
			<time>{event.createdAt}</time>
		</li>)}</ul>}
	</AuditSurface>;
}

function AuditSurface({ children }: { children: ReactNode }) {
	return <section className="business-proof" aria-label="Scoped durable Audit state">
		<h2>Audit proof</h2>
		{children}
		<p>Actor attribution is not recorded in the current audit schema.</p>
	</section>;
}

function unavailable(): Extract<AuditProofOutcome, { kind: "error" }> {
	return { kind: "error", message: "Durable Audit state could not be verified." };
}

function parseAuditEvents(value: unknown, scope: { tenantId: string; storeId: string }): ScopedAuditEvent[] | undefined {
	return Array.isArray(value) && value.every((item) => isAuditEvent(item, scope)) ? value : undefined;
}

function isAuditEvent(value: unknown, scope: { tenantId: string; storeId: string }): value is ScopedAuditEvent {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const event = value as Record<string, unknown>;
	const allowed = new Set(["id", "tenantId", "storeId", "conversationId", "eventType", "outcome", "toolsCalled", "createdAt"]);
	if (Object.keys(event).some((key) => !allowed.has(key))) return false;
	if (
		event.tenantId !== scope.tenantId ||
		event.storeId !== scope.storeId ||
		event.eventType !== "support-agent.audit" ||
		!["id", "tenantId", "storeId", "conversationId", "createdAt"].every((key) => typeof event[key] === "string")
	) return false;
	if (
		event.outcome !== undefined &&
		(typeof event.outcome !== "string" || !publicAuditOutcomes.includes(event.outcome as NonNullable<ScopedAuditEvent["outcome"]>))
	)
		return false;
	return Array.isArray(event.toolsCalled) && event.toolsCalled.every(
		(tool) => typeof tool === "string" && publicAuditTools.includes(tool as ScopedAuditEvent["toolsCalled"][number]),
	);
}
