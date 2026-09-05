import { useEffect, useRef, useState } from "react";
import type { SessionApi } from "../session.ts";
import { canViewNeedsAttention, type StoreOpsActor } from "./authority.ts";
import { loadNeedsAttention } from "./api.ts";
import type { NeedsAttentionDTO } from "./dto.ts";
import { StoreOpsReadLifecycle } from "./lifecycle.ts";

/**
 * Needs Attention view (sections 4.5 and 7): a read-only, supervisor/admin-scoped projection of
 * conversations whose latest completed outcome is fallback or which have a durable handoff. It exposes
 * only `basis`; it never invents a diagnosis, a resolved state, an assignment or an ordinary-handoff bypass.
 */

export type NeedsAttentionState =
	| { status: "loading" }
	| { status: "unavailable" }
	| { status: "forbidden" }
	| { status: "ready"; items: NeedsAttentionDTO[]; truncated: boolean };

const basisLabels: Record<NeedsAttentionDTO["basis"], string> = {
	fallback: "Fallback",
	durable_handoff: "Durable handoff",
};

export function NeedsAttentionSurface({ state }: { state: NeedsAttentionState }) {
	return (
		<section className="storeops-view storeops-needs-attention" aria-label="Needs Attention read-only manager view">
			<p className="eyebrow">Manager review queue</p>
			<h2>Needs Attention</h2>
			<p className="storeops-readonly-note" role="note">
				Read-only manager projection. Resolution, assignment and status are not changed here; handling happens
				through the existing conversation and handoff workflow. Basis is shown as persisted, without an invented
				internal diagnosis.
			</p>
			{renderNeedsAttentionState(state)}
		</section>
	);
}

function renderNeedsAttentionState(state: NeedsAttentionState) {
	if (state.status === "loading") {
		return <p className="status" role="status">Loading conversations that need attention…</p>;
	}
	if (state.status === "forbidden") {
		return (
			<p className="notice" role="status">
				Needs Attention is a manager view and is not authorized for your current server-derived role.
			</p>
		);
	}
	if (state.status === "unavailable") {
		return (
			<p className="notice" role="alert">
				Needs Attention could not be loaded. This is a load failure, not an empty queue.
			</p>
		);
	}
	if (state.items.length === 0) {
		return <p className="storeops-empty">No conversations currently need attention.</p>;
	}
	return (
		<>
			{state.truncated ? (
				<p className="storeops-bound">Showing the latest {state.items.length} conversations (server-bounded).</p>
			) : null}
			<ul className="storeops-list">
				{state.items.map((item) => (
					<li key={item.conversationId} className={`storeops-attention-row basis-${item.basis}`}>
						<strong>{item.conversationId}</strong>
						<span className="storeops-badge">{basisLabels[item.basis]}</span>
						<span>{item.handoffId === null ? "No durable handoff id" : `Handoff ${item.handoffId}`}</span>
						<time>{item.lastActivityAt}</time>
					</li>
				))}
			</ul>
		</>
	);
}

export function NeedsAttentionView({
	api,
	actor,
	onSessionInvalidated,
	onAuthorizationError,
}: {
	api: SessionApi;
	actor: StoreOpsActor;
	onSessionInvalidated?: () => void;
	onAuthorizationError?: () => void;
}) {
	const [state, setState] = useState<NeedsAttentionState>({ status: "loading" });
	const lifecycle = useRef(new StoreOpsReadLifecycle());
	useEffect(() => {
		if (!canViewNeedsAttention(actor)) {
			setState({ status: "forbidden" });
			return;
		}
		const token = lifecycle.current.begin();
		setState({ status: "loading" });
		void loadNeedsAttention(api).then((outcome) => {
			if (!lifecycle.current.complete(token)) return;
			if (outcome.kind === "success") {
				setState({
					status: "ready",
					items: outcome.value.items,
					truncated: outcome.value.truncated === true,
				});
				return;
			}
			if (outcome.kind === "forbidden") {
				setState({ status: "forbidden" });
				onAuthorizationError?.();
				return;
			}
			setState({ status: "unavailable" });
			if (outcome.kind === "session-invalidated") onSessionInvalidated?.();
		});
		return () => lifecycle.current.invalidate();
	}, [api, actor]);
	return <NeedsAttentionSurface state={state} />;
}
