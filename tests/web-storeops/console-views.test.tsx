import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { IdentityContext, SessionApi } from "../../web/src/session.ts";
import type { KnowledgeDTO, NeedsAttentionDTO } from "../../web/src/storeops/dto.ts";
import { KnowledgeEvidenceSurface, type KnowledgeState } from "../../web/src/storeops/knowledge.tsx";
import { NeedsAttentionSurface, type NeedsAttentionState } from "../../web/src/storeops/needs-attention.tsx";
import { StoreOpsConsole } from "../../web/src/storeops/storeops.tsx";

/**
 * Knowledge / Evidence, Needs Attention and console-composition tests (sections 4.5 and 7). Knowledge is a
 * read-only approved-registry catalog whose metadata is explicitly distinct from the evidence actually used
 * to answer a turn (that lives in the Support result). Needs Attention is a read-only manager projection that
 * exposes basis only. The console composes exactly the four contracted views and mounts Needs Attention only
 * for a supervisor/admin. Effects never run under renderToStaticMarkup, so child views show their loading
 * state, which is enough to assert the composition and the manager gate.
 */

const unusedApi: SessionApi = {
	async request() {
		throw new Error("The session api is never called during a static render.");
	},
};

const knowledge: KnowledgeDTO = {
	id: "kb-1",
	kind: "policy",
	title: "Refund window",
	version: "v1",
	sourceRef: "test://kb-1",
	updatedAt: "2026-09-01T00:00:00.000Z",
	status: "approved",
};

const attention: NeedsAttentionDTO = {
	conversationId: "conversation-a",
	basis: "durable_handoff",
	handoffId: "handoff-1",
	lastActivityAt: "2026-09-05T01:00:00.000Z",
};

function context(role: string, capabilities: string[]): IdentityContext {
	return {
		actor: { userId: `user-${role}`, role, capabilities },
		scope: { tenantId: "tenant-a", storeId: "store-a1" },
		request: { requestId: "request-1" },
	};
}

describe("KnowledgeEvidenceSurface is a read-only catalog distinct from used evidence (section 7)", () => {
	it("always states that registry metadata is not the evidence used to answer a request", () => {
		const markup = renderToStaticMarkup(<KnowledgeEvidenceSurface state={{ status: "loading" }} />);
		expect(markup).toContain("approved knowledge registry metadata only");
		expect(markup).toContain("It is not the evidence actually used to");
		expect(markup).toContain("the used evidence for a turn appears in that Support result");
	});

	it("renders loading, forbidden, load failure and empty as distinct states", () => {
		expect(renderKnowledge({ status: "loading" })).toContain("Loading approved knowledge");
		expect(renderKnowledge({ status: "forbidden" })).toContain("Knowledge is not authorized for your current server-derived role.");

		const unavailable = renderKnowledge({ status: "unavailable" });
		expect(unavailable).toContain("This is a load failure, not an empty registry.");

		const empty = renderKnowledge({ status: "ready", items: [] });
		expect(empty).toContain("No approved knowledge entries are registered.");
		expect(empty).not.toContain("load failure");
	});

	it("renders approved metadata read-only, with no mutation control", () => {
		const markup = renderKnowledge({ status: "ready", items: [knowledge] });
		expect(markup).toContain("Refund window");
		expect(markup).toContain("test://kb-1");
		expect(markup).toContain("Version v1");
		expect(markup).toContain("storeops-badge-approved");
		// "approved" is displayed as registry data, but the catalog offers no control to upload or approve.
		expect(markup).not.toContain("<button");
		expect(markup).not.toContain("<form");
		expect(markup).not.toContain("<input");
		expect(markup).not.toContain("<select");
	});
});

describe("NeedsAttentionSurface is a read-only manager projection (sections 4.5 and 7)", () => {
	it("states that resolution, assignment and status are not changed here and shows basis only", () => {
		const markup = renderToStaticMarkup(<NeedsAttentionSurface state={{ status: "loading" }} />);
		expect(markup).toContain("Read-only manager projection");
		expect(markup).toContain("Resolution, assignment and status are not changed here");
		expect(markup).toContain("without an invented");
	});

	it("renders forbidden, load failure and empty distinctly", () => {
		expect(renderAttention({ status: "forbidden" })).toContain("is a manager view and is not authorized");
		expect(renderAttention({ status: "unavailable" })).toContain("This is a load failure, not an empty queue.");
		expect(renderAttention({ status: "ready", items: [], truncated: false })).toContain("No conversations currently need attention.");
	});

	it("renders basis labels and a server-bounded notice, read-only", () => {
		const markup = renderAttention({ status: "ready", items: [attention], truncated: true });
		expect(markup).toContain("Durable handoff");
		expect(markup).toContain("conversation-a");
		expect(markup).toContain("Handoff handoff-1");
		expect(markup).toContain("Showing the latest 1 conversations (server-bounded).");
		expect(markup).not.toContain("<button");
		expect(markup).not.toContain("<form");

		const fallback = renderAttention({
			status: "ready",
			items: [{ ...attention, basis: "fallback", handoffId: null }],
			truncated: false,
		});
		expect(fallback).toContain("Fallback");
		expect(fallback).toContain("No durable handoff id");
	});
});

describe("StoreOpsConsole composes exactly the four contracted views (section 7)", () => {
	it("shows a forbidden notice and no views for an actor without storeops:read", () => {
		const markup = renderToStaticMarkup(
			<StoreOpsConsole context={context("agent", ["conversation:read"])} api={unusedApi} />,
		);
		expect(markup).toContain("Store operations are not available for your current server-derived role.");
		expect(markup).not.toContain("Today Availability");
		expect(markup).not.toContain("Booking Intents");
	});

	it("mounts availability, booking intents and knowledge for an agent but withholds the manager queue", () => {
		const markup = renderToStaticMarkup(
			<StoreOpsConsole
				context={context("agent", ["storeops:read", "booking-intent:create"])}
				api={unusedApi}
			/>,
		);
		expect(markup).toContain("Today Availability");
		expect(markup).toContain("Booking Intents");
		expect(markup).toContain("Knowledge / Evidence");
		expect(markup).not.toContain("Needs Attention read-only manager view");
	});

	it("adds the read-only Needs Attention manager view for a supervisor", () => {
		const markup = renderToStaticMarkup(
			<StoreOpsConsole
				context={context("supervisor", ["storeops:read", "availability:write", "booking-intent:create", "booking-intent:manage"])}
				api={unusedApi}
			/>,
		);
		expect(markup).toContain("Today Availability");
		expect(markup).toContain("Booking Intents");
		expect(markup).toContain("Knowledge / Evidence");
		expect(markup).toContain("Needs Attention read-only manager view");
	});
});

function renderKnowledge(state: KnowledgeState): string {
	return renderToStaticMarkup(<KnowledgeEvidenceSurface state={state} />);
}

function renderAttention(state: NeedsAttentionState): string {
	return renderToStaticMarkup(<NeedsAttentionSurface state={state} />);
}
