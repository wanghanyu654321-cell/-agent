import { useEffect, useRef, useState } from "react";
import type { SessionApi } from "../session.ts";
import { canReadStoreOps, type StoreOpsActor } from "./authority.ts";
import { loadKnowledge } from "./api.ts";
import type { KnowledgeDTO } from "./dto.ts";
import { StoreOpsReadLifecycle } from "./lifecycle.ts";

/**
 * Knowledge / Evidence view (section 7). Read-only: it lists current approved registry metadata and
 * never offers upload/approve actions. The list is a catalog — it is NOT a claim that any entry was
 * used to answer a request. Actual used evidence stays in the existing Support result projection.
 */

export type KnowledgeState =
	| { status: "loading" }
	| { status: "unavailable" }
	| { status: "forbidden" }
	| { status: "ready"; items: KnowledgeDTO[] };

export function KnowledgeEvidenceSurface({ state }: { state: KnowledgeState }) {
	return (
		<section className="storeops-view storeops-knowledge" aria-label="Knowledge and evidence registry">
			<p className="eyebrow">Approved registry metadata</p>
			<h2>Knowledge / Evidence</h2>
			<p className="storeops-evidence-note" role="note">
				This catalog lists approved knowledge registry metadata only. It is not the evidence actually used to
				answer any specific request; the used evidence for a turn appears in that Support result.
			</p>
			{renderKnowledgeState(state)}
		</section>
	);
}

function renderKnowledgeState(state: KnowledgeState) {
	if (state.status === "loading") {
		return <p className="status" role="status">Loading approved knowledge…</p>;
	}
	if (state.status === "forbidden") {
		return (
			<p className="notice" role="status">
				Knowledge is not authorized for your current server-derived role.
			</p>
		);
	}
	if (state.status === "unavailable") {
		return (
			<p className="notice" role="alert">
				Approved knowledge could not be loaded. This is a load failure, not an empty registry.
			</p>
		);
	}
	if (state.items.length === 0) {
		return <p className="storeops-empty">No approved knowledge entries are registered.</p>;
	}
	return (
		<ul className="storeops-list">
			{state.items.map((entry) => (
				<li key={entry.id} className={`storeops-knowledge-entry kind-${entry.kind}`}>
					<strong>{entry.title}</strong>
					<span className="storeops-badge">{entry.kind}</span>
					<span className="storeops-badge storeops-badge-approved">{entry.status}</span>
					<code>{entry.sourceRef}</code>
					<span>Version {entry.version}</span>
					<time>{entry.updatedAt}</time>
				</li>
			))}
		</ul>
	);
}

export function KnowledgeEvidenceView({
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
	const [state, setState] = useState<KnowledgeState>({ status: "loading" });
	const lifecycle = useRef(new StoreOpsReadLifecycle());
	useEffect(() => {
		if (!canReadStoreOps(actor)) {
			setState({ status: "forbidden" });
			return;
		}
		const token = lifecycle.current.begin();
		setState({ status: "loading" });
		void loadKnowledge(api).then((outcome) => {
			if (!lifecycle.current.complete(token)) return;
			if (outcome.kind === "success") {
				setState({ status: "ready", items: outcome.value.items });
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
	return <KnowledgeEvidenceSurface state={state} />;
}
