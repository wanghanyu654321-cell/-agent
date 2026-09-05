import type { IdentityContext, SessionApi } from "../session.ts";
import { createSameOriginSessionApi } from "../session.ts";
import { canReadStoreOps, canViewNeedsAttention, type StoreOpsActor } from "./authority.ts";
import { TodayAvailabilityView } from "./availability.tsx";
import { BookingIntentsView } from "./booking-intents.tsx";
import { KnowledgeEvidenceView } from "./knowledge.tsx";
import { NeedsAttentionView } from "./needs-attention.tsx";
import "./storeops.css";

/**
 * StoreOps console: the bounded React operations surface composed of exactly the four contracted views
 * (Today Availability, Booking Intents, Knowledge / Evidence, Needs Attention). Final Integration mounts
 * this into `web/src/App.tsx`; Track C does not edit App.tsx, the session authority helpers or the backend.
 * Identity, role, capabilities, tenant and store are always server-derived and passed in via `context`.
 */

const storeOpsSessionApi = createSameOriginSessionApi();

export function StoreOpsConsole({
	context,
	api = storeOpsSessionApi,
	onSessionInvalidated,
	onAuthorizationError,
}: {
	context: IdentityContext;
	api?: SessionApi;
	onSessionInvalidated?: () => void;
	onAuthorizationError?: () => void;
}) {
	const actor: StoreOpsActor = {
		userId: context.actor.userId,
		role: context.actor.role,
		capabilities: context.actor.capabilities,
	};

	if (!canReadStoreOps(actor)) {
		return (
			<section className="storeops-console storeops-console-forbidden" aria-label="Store operations">
				<p className="eyebrow">Store operations</p>
				<h2>StoreOps</h2>
				<p className="notice" role="status">
					Store operations are not available for your current server-derived role.
				</p>
			</section>
		);
	}

	return (
		<section className="storeops-console" aria-label="Store operations">
			<p className="eyebrow">Store operations</p>
			<h2>StoreOps</h2>
			<TodayAvailabilityView
				api={api}
				actor={actor}
				onSessionInvalidated={onSessionInvalidated}
				onAuthorizationError={onAuthorizationError}
			/>
			<BookingIntentsView
				api={api}
				actor={actor}
				onSessionInvalidated={onSessionInvalidated}
				onAuthorizationError={onAuthorizationError}
			/>
			<KnowledgeEvidenceView
				api={api}
				actor={actor}
				onSessionInvalidated={onSessionInvalidated}
				onAuthorizationError={onAuthorizationError}
			/>
			{canViewNeedsAttention(actor) ? (
				<NeedsAttentionView
					api={api}
					actor={actor}
					onSessionInvalidated={onSessionInvalidated}
					onAuthorizationError={onAuthorizationError}
				/>
			) : null}
		</section>
	);
}
