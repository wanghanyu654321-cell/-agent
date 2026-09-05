import { type FormEvent, useEffect, useRef, useState } from "react";
import type { SessionApi } from "../session.ts";
import {
	bookingActionNeedsInterval,
	canCreateBookingIntent,
	canReadStoreOps,
	permittedBookingActions,
	type StoreOpsActor,
} from "./authority.ts";
import {
	type BookingIntentDraft,
	type BookingTransitionDraft,
	type CreateBookingOutcome,
	createBookingIntent,
	loadBookingIntents,
	newIdempotencyKey,
	type StoreOpsWriteOutcome,
	transitionBookingIntent,
} from "./api.ts";
import type { BookingIntentAction, BookingIntentDTO, BookingIntentStatus } from "./dto.ts";
import { StoreOpsReadLifecycle, StoreOpsSubmitLifecycle } from "./lifecycle.ts";

/**
 * Booking Intents view (sections 4.4 and 7). Intents are captured, never auto-confirmed. Only the
 * actions the contract permits for the current status and the actor's server-derived capabilities are
 * rendered. Writes carry `expectedVersion`; a 409 conflict reloads instead of retrying. Create replays
 * are idempotent via a client Idempotency-Key that is stable across a retry of the same draft.
 */

export type BookingIntentsState =
	| { status: "loading" }
	| { status: "unavailable" }
	| { status: "forbidden" }
	| { status: "ready"; items: BookingIntentDTO[]; truncated: boolean };

export type BookingFeedback =
	| { kind: "idle" }
	| { kind: "saving" }
	| { kind: "invalid"; message: string }
	| { kind: "conflict"; message: string }
	| { kind: "not_found"; message: string }
	| { kind: "forbidden"; message: string }
	| { kind: "duplicate"; message: string }
	| { kind: "error"; message: string };

const statusLabels: Record<BookingIntentStatus, string> = {
	pending_confirmation: "Pending confirmation",
	confirmed: "Confirmed",
	alternative_proposed: "Alternative proposed",
	cancelled: "Cancelled",
};

const actionLabels: Record<BookingIntentAction, string> = {
	confirm: "Confirm",
	propose_alternative: "Propose alternative",
	cancel: "Cancel intent",
};

function toInstant(value: string): string | undefined {
	if (value.length === 0) return undefined;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function BookingFeedbackNotice({ feedback }: { feedback: BookingFeedback }) {
	if (feedback.kind === "idle") return null;
	if (feedback.kind === "saving") return <p className="status" role="status">Saving booking intent…</p>;
	if (feedback.kind === "forbidden" || feedback.kind === "duplicate") {
		return <p className="notice" role="status">{feedback.message}</p>;
	}
	return <p className={`notice storeops-${feedback.kind}`} role="alert">{feedback.message}</p>;
}

function writeFeedbackFor(outcome: StoreOpsWriteOutcome<BookingIntentDTO>): BookingFeedback {
	switch (outcome.kind) {
		case "success":
			return { kind: "idle" };
		case "conflict":
			return { kind: "conflict", message: outcome.message };
		case "not_found":
			return { kind: "not_found", message: outcome.message };
		case "forbidden":
			return { kind: "forbidden", message: "That booking action is not authorized for your current role." };
		case "session-invalidated":
			return { kind: "error", message: "Your session expired while updating the intent." };
		default:
			return { kind: "error", message: outcome.message };
	}
}

function createFeedbackFor(outcome: CreateBookingOutcome): BookingFeedback {
	if (outcome.kind === "success") {
		return outcome.created
			? { kind: "idle" }
			: { kind: "duplicate", message: "This booking intent was already recorded (idempotent replay)." };
	}
	if (outcome.kind === "conflict") return { kind: "conflict", message: outcome.message };
	if (outcome.kind === "not_found") return { kind: "not_found", message: outcome.message };
	if (outcome.kind === "forbidden") {
		return { kind: "forbidden", message: "Creating a booking intent is not authorized for your current role." };
	}
	if (outcome.kind === "session-invalidated") return { kind: "error", message: "Your session expired while recording." };
	return { kind: "error", message: outcome.message };
}

export function BookingIntentActionControl({
	action,
	status,
	busy,
	onRun,
}: {
	action: BookingIntentAction;
	status: BookingIntentStatus;
	busy: boolean;
	onRun: (action: BookingIntentAction, start?: string, end?: string) => void;
}) {
	const [start, setStart] = useState("");
	const [end, setEnd] = useState("");
	if (!bookingActionNeedsInterval(action, status)) {
		const label =
			action === "confirm" && status === "alternative_proposed" ? "Confirm proposed alternative" : actionLabels[action];
		return (
			<form
				className="storeops-intent-action"
				onSubmit={(event) => {
					event.preventDefault();
					onRun(action);
				}}
			>
				<button type="submit" disabled={busy}>
					{label}
				</button>
			</form>
		);
	}
	return (
		<form
			className="storeops-intent-action storeops-intent-action-interval"
			onSubmit={(event) => {
				event.preventDefault();
				onRun(action, toInstant(start), toInstant(end));
			}}
		>
			<label>
				Start
				<input type="datetime-local" value={start} disabled={busy} onChange={(event) => setStart(event.target.value)} />
			</label>
			<label>
				End
				<input type="datetime-local" value={end} disabled={busy} onChange={(event) => setEnd(event.target.value)} />
			</label>
			<button type="submit" disabled={busy}>
				{actionLabels[action]}
			</button>
		</form>
	);
}

export function BookingIntentRow({
	intent,
	actor,
	onAction,
}: {
	intent: BookingIntentDTO;
	actor: StoreOpsActor;
	onAction: (draft: BookingTransitionDraft) => Promise<StoreOpsWriteOutcome<BookingIntentDTO>>;
}) {
	const [busy, setBusy] = useState(false);
	const [feedback, setFeedback] = useState<BookingFeedback>({ kind: "idle" });
	const lifecycle = useRef(new StoreOpsSubmitLifecycle());
	useEffect(() => () => lifecycle.current.invalidate(), []);
	const actions = permittedBookingActions(actor, intent);

	async function runAction(action: BookingIntentAction, start?: string, end?: string) {
		const token = lifecycle.current.begin();
		if (token === undefined) return;
		if (bookingActionNeedsInterval(action, intent.status) && (!start || !end || end <= start)) {
			lifecycle.current.complete(token);
			setFeedback({ kind: "invalid", message: "Enter a start and end instant where the end is after the start." });
			return;
		}
		setBusy(true);
		setFeedback({ kind: "saving" });
		const outcome = await onAction({ id: intent.id, expectedVersion: intent.version, action, start, end });
		if (!lifecycle.current.complete(token)) return;
		setBusy(false);
		setFeedback(writeFeedbackFor(outcome));
	}

	return (
		<li className={`storeops-intent-row status-${intent.status}`}>
			<div className="storeops-intent-summary">
				<strong>{intent.requestedService}</strong>
				<span className={`storeops-badge storeops-status-${intent.status}`}>{statusLabels[intent.status]}</span>
				<span>Conversation {intent.conversationId}</span>
				<span>
					Requested{" "}
					{intent.requestedStart === null || intent.requestedEnd === null
						? "no specific time"
						: `${intent.requestedStart} – ${intent.requestedEnd}`}
				</span>
				<span>{intent.preferredStaffMembershipId === null ? "No staff preference" : `Preferred ${intent.preferredStaffMembershipId}`}</span>
				{intent.alternativeStart !== null && intent.alternativeEnd !== null ? (
					<span>Proposed alternative {intent.alternativeStart} – {intent.alternativeEnd}</span>
				) : null}
				{intent.confirmedStart !== null && intent.confirmedEnd !== null ? (
					<span>Confirmed {intent.confirmedStart} – {intent.confirmedEnd}</span>
				) : null}
				<span className="storeops-intent-meta">Version {intent.version} · created by {intent.createdByUserId}</span>
			</div>
			<div className="storeops-intent-actions">
				{actions.length === 0 ? (
					<p className="storeops-terminal">Terminal — no further actions are permitted.</p>
				) : (
					actions.map((action) => (
						<BookingIntentActionControl
							key={action}
							action={action}
							status={intent.status}
							busy={busy}
							onRun={(next, start, end) => void runAction(next, start, end)}
						/>
					))
				)}
			</div>
			<BookingFeedbackNotice feedback={feedback} />
		</li>
	);
}

export function BookingIntentCreateForm({
	onCreate,
}: {
	onCreate: (draft: BookingIntentDraft) => Promise<CreateBookingOutcome>;
}) {
	const [conversationId, setConversationId] = useState("");
	const [requestedService, setRequestedService] = useState("");
	const [requestedStart, setRequestedStart] = useState("");
	const [requestedEnd, setRequestedEnd] = useState("");
	const [preferredStaffMembershipId, setPreferredStaffMembershipId] = useState("");
	const [busy, setBusy] = useState(false);
	const [feedback, setFeedback] = useState<BookingFeedback>({ kind: "idle" });
	const lifecycle = useRef(new StoreOpsSubmitLifecycle());
	const keyRef = useRef<{ signature: string; key: string } | undefined>(undefined);

	useEffect(() => () => lifecycle.current.invalidate(), []);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const token = lifecycle.current.begin();
		if (token === undefined) return;
		const service = requestedService.trim();
		const conversation = conversationId.trim();
		if (conversation.length === 0 || service.length === 0 || service.length > 200) {
			lifecycle.current.complete(token);
			setFeedback({ kind: "invalid", message: "Conversation id and a service (max 200 characters) are required." });
			return;
		}
		const start = toInstant(requestedStart);
		const end = toInstant(requestedEnd);
		if ((start && !end) || (!start && end) || (start && end && end <= start)) {
			lifecycle.current.complete(token);
			setFeedback({ kind: "invalid", message: "Requested times must be a start and end instant with end after start." });
			return;
		}
		const staff = preferredStaffMembershipId.trim();
		const signature = JSON.stringify([conversation, service, start ?? null, end ?? null, staff]);
		if (keyRef.current?.signature !== signature) keyRef.current = { signature, key: newIdempotencyKey() };
		setBusy(true);
		setFeedback({ kind: "saving" });
		const outcome = await onCreate({
			idempotencyKey: keyRef.current.key,
			conversationId: conversation,
			requestedService: service,
			...(start ? { requestedStart: start } : {}),
			...(end ? { requestedEnd: end } : {}),
			...(staff.length > 0 ? { preferredStaffMembershipId: staff } : {}),
		});
		if (!lifecycle.current.complete(token)) return;
		setBusy(false);
		setFeedback(createFeedbackFor(outcome));
		if (outcome.kind === "success") {
			keyRef.current = undefined;
			setConversationId("");
			setRequestedService("");
			setRequestedStart("");
			setRequestedEnd("");
			setPreferredStaffMembershipId("");
		}
	}

	return (
		<form className="storeops-intent-create" onSubmit={(event) => void submit(event)} aria-label="Capture a booking intent">
			<label>
				Conversation id
				<input value={conversationId} disabled={busy} onChange={(event) => setConversationId(event.target.value)} />
			</label>
			<label>
				Requested service
				<input value={requestedService} disabled={busy} maxLength={200} onChange={(event) => setRequestedService(event.target.value)} />
			</label>
			<label>
				Requested start (optional)
				<input type="datetime-local" value={requestedStart} disabled={busy} onChange={(event) => setRequestedStart(event.target.value)} />
			</label>
			<label>
				Requested end (optional)
				<input type="datetime-local" value={requestedEnd} disabled={busy} onChange={(event) => setRequestedEnd(event.target.value)} />
			</label>
			<label>
				Preferred staff membership (optional)
				<input value={preferredStaffMembershipId} disabled={busy} onChange={(event) => setPreferredStaffMembershipId(event.target.value)} />
			</label>
			<BookingFeedbackNotice feedback={feedback} />
			<button type="submit" disabled={busy}>
				{busy ? "Recording…" : "Capture booking intent"}
			</button>
			<p className="storeops-note">Capturing an intent does not confirm a booking; confirmation is a separate authorized human action.</p>
		</form>
	);
}

export function BookingIntentsSurface({ state, actor, onAction, onCreate }: {
	state: BookingIntentsState;
	actor: StoreOpsActor;
	onAction: (draft: BookingTransitionDraft) => Promise<StoreOpsWriteOutcome<BookingIntentDTO>>;
	onCreate: (draft: BookingIntentDraft) => Promise<CreateBookingOutcome>;
}) {
	return (
		<section className="storeops-view storeops-booking-intents" aria-label="Booking intents">
			<p className="eyebrow">Booking intents</p>
			<h2>Booking Intents</h2>
			{canCreateBookingIntent(actor) ? <BookingIntentCreateForm onCreate={onCreate} /> : null}
			{renderBookingIntentsState(state, actor, onAction)}
		</section>
	);
}

function renderBookingIntentsState(
	state: BookingIntentsState,
	actor: StoreOpsActor,
	onAction: (draft: BookingTransitionDraft) => Promise<StoreOpsWriteOutcome<BookingIntentDTO>>,
) {
	if (state.status === "loading") return <p className="status" role="status">Loading booking intents…</p>;
	if (state.status === "forbidden") {
		return <p className="notice" role="status">Booking intents are not authorized for your current server-derived role.</p>;
	}
	if (state.status === "unavailable") {
		return (
			<p className="notice storeops-unavailable" role="alert">
				Booking intents could not be loaded. This is a load failure, not an empty list.
			</p>
		);
	}
	if (state.items.length === 0) {
		return <p className="storeops-empty">No booking intents were returned. This does not mean there is no capacity.</p>;
	}
	return (
		<>
			{state.truncated ? (
				<p className="storeops-bound">Showing the latest {state.items.length} intents (server-bounded).</p>
			) : null}
			<ul className="storeops-list">
				{state.items.map((intent) => (
					<BookingIntentRow key={intent.id} intent={intent} actor={actor} onAction={onAction} />
				))}
			</ul>
		</>
	);
}

export function BookingIntentsView({
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
	const [state, setState] = useState<BookingIntentsState>({ status: "loading" });
	const lifecycle = useRef(new StoreOpsReadLifecycle());

	async function reload() {
		const token = lifecycle.current.begin();
		const outcome = await loadBookingIntents(api);
		if (!lifecycle.current.complete(token)) return;
		if (outcome.kind === "success") {
			setState({ status: "ready", items: outcome.value.items, truncated: outcome.value.truncated === true });
			return;
		}
		if (outcome.kind === "forbidden") {
			setState({ status: "forbidden" });
			onAuthorizationError?.();
			return;
		}
		setState({ status: "unavailable" });
		if (outcome.kind === "session-invalidated") onSessionInvalidated?.();
	}

	useEffect(() => {
		if (!canReadStoreOps(actor)) {
			setState({ status: "forbidden" });
			return;
		}
		setState({ status: "loading" });
		void reload();
		return () => lifecycle.current.invalidate();
	}, [api, actor]);

	async function handleAction(draft: BookingTransitionDraft): Promise<StoreOpsWriteOutcome<BookingIntentDTO>> {
		const outcome = await transitionBookingIntent(api, draft);
		if (outcome.kind === "session-invalidated") {
			setState({ status: "unavailable" });
			onSessionInvalidated?.();
			return outcome;
		}
		if (outcome.kind === "forbidden") onAuthorizationError?.();
		if (outcome.kind === "success" || outcome.kind === "conflict") await reload();
		return outcome;
	}

	async function handleCreate(draft: BookingIntentDraft): Promise<CreateBookingOutcome> {
		const outcome = await createBookingIntent(api, draft);
		if (outcome.kind === "session-invalidated") {
			setState({ status: "unavailable" });
			onSessionInvalidated?.();
			return outcome;
		}
		if (outcome.kind === "forbidden") onAuthorizationError?.();
		if (outcome.kind === "success" || outcome.kind === "conflict") await reload();
		return outcome;
	}

	return <BookingIntentsSurface state={state} actor={actor} onAction={handleAction} onCreate={handleCreate} />;
}
