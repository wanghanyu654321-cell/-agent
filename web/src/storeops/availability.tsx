import { type FormEvent, useEffect, useRef, useState } from "react";
import type { SessionApi } from "../session.ts";
import { canWriteAvailability, type StoreOpsActor } from "./authority.ts";
import { type AvailabilityDraft, loadAvailability, saveAvailability, type StoreOpsWriteOutcome } from "./api.ts";
import {
	type AvailabilityBoardDTO,
	type AvailabilityDTO,
	type AvailabilityStatus,
	type AvailabilityWindow,
	validateWindows,
	type WindowValidationError,
} from "./dto.ts";
import { StoreOpsReadLifecycle, StoreOpsSubmitLifecycle } from "./lifecycle.ts";

/**
 * Today Availability view (sections 4.3 and 7). Three row states stay visually distinct:
 * unknown (missing or withdrawn row = not recorded), no listed window (published empty array) and
 * available (published windows). A load failure is a separate view-level `unavailable` state and is
 * never rendered as an empty day. Writes are supervisor/admin only, carry `expectedVersion`, and a 409
 * conflict forces a reload instead of a silent retry/overwrite.
 */

export type AvailabilityRowState = "unknown" | "no_window" | "available";

export type AvailabilityState =
	| { status: "loading" }
	| { status: "unavailable" }
	| { status: "forbidden" }
	| { status: "ready"; board: AvailabilityBoardDTO; date: string };

export type AvailabilityFeedback =
	| { kind: "idle" }
	| { kind: "saving" }
	| { kind: "invalid"; message: string }
	| { kind: "conflict"; message: string }
	| { kind: "not_found"; message: string }
	| { kind: "forbidden"; message: string }
	| { kind: "error"; message: string };

const windowErrorMessages: Record<WindowValidationError, string> = {
	too_many: "At most 24 windows are allowed per day.",
	bad_format: "Each window needs a start and end in HH:mm.",
	end_before_start: "Each window must end after it starts (same day, no overnight).",
	overlap: "Windows must not overlap.",
};

/** Resolves "today" as a local YYYY-MM-DD, honouring an authoritative IANA timeZone when supplied. */
export function localDateIn(timeZone?: string): string {
	const now = new Date();
	try {
		const parts = new Intl.DateTimeFormat("en-CA", {
			timeZone: timeZone && timeZone.length > 0 ? timeZone : undefined,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).formatToParts(now);
		const year = parts.find((part) => part.type === "year")?.value ?? "";
		const month = parts.find((part) => part.type === "month")?.value ?? "";
		const day = parts.find((part) => part.type === "day")?.value ?? "";
		return `${year}-${month}-${day}`;
	} catch {
		return now.toISOString().slice(0, 10);
	}
}

export function deriveAvailabilityRow(
	items: AvailabilityDTO[],
	staffMembershipId: string,
	date: string,
): { rowState: AvailabilityRowState; item?: AvailabilityDTO; reason?: "not_recorded" | "withdrawn" } {
	const item = items.find((entry) => entry.staffMembershipId === staffMembershipId && entry.localDate === date);
	if (!item) return { rowState: "unknown", reason: "not_recorded" };
	if (item.status === "withdrawn") return { rowState: "unknown", item, reason: "withdrawn" };
	if (item.windows.length === 0) return { rowState: "no_window", item };
	return { rowState: "available", item };
}

export function AvailabilityFeedbackNotice({ feedback }: { feedback: AvailabilityFeedback }) {
	if (feedback.kind === "idle") return null;
	if (feedback.kind === "saving") return <p className="status" role="status">Saving availability…</p>;
	if (feedback.kind === "forbidden") {
		return <p className="notice" role="status">{feedback.message}</p>;
	}
	return <p className={`notice storeops-${feedback.kind}`} role="alert">{feedback.message}</p>;
}

export function AvailabilityRowSurface({
	displayName,
	row,
}: {
	displayName: string;
	row: { rowState: AvailabilityRowState; item?: AvailabilityDTO; reason?: "not_recorded" | "withdrawn" };
}) {
	if (row.rowState === "unknown") {
		const label = row.reason === "withdrawn" ? "Unknown — withdrawn" : "Unknown — not recorded";
		return (
			<li className="storeops-avail-row state-unknown">
				<strong>{displayName}</strong>
				<span className="storeops-badge storeops-avail-unknown">{label}</span>
			</li>
		);
	}
	if (row.rowState === "no_window") {
		return (
			<li className="storeops-avail-row state-no-window">
				<strong>{displayName}</strong>
				<span className="storeops-badge storeops-avail-none">No listed window</span>
			</li>
		);
	}
	const item = row.item as AvailabilityDTO;
	return (
		<li className="storeops-avail-row state-available">
			<strong>{displayName}</strong>
			<span className="storeops-badge storeops-avail-open">Available</span>
			<ul className="storeops-windows">
				{item.windows.map((window) => (
					<li key={`${window.start}-${window.end}`}>
						<time>{window.start}</time>–<time>{window.end}</time>
					</li>
				))}
			</ul>
		</li>
	);
}

export function TodayAvailabilitySurface({ state, actor }: { state: AvailabilityState; actor: StoreOpsActor }) {
	return (
		<section className="storeops-view storeops-availability" aria-label="Today availability">
			<p className="eyebrow">Staff availability</p>
			<h2>Today Availability</h2>
			{renderAvailabilityState(state, actor)}
		</section>
	);
}

function renderAvailabilityState(state: AvailabilityState, actor: StoreOpsActor) {
	if (state.status === "loading") {
		return <p className="status" role="status">Loading today's availability…</p>;
	}
	if (state.status === "forbidden") {
		return (
			<p className="notice" role="status">
				Availability is not authorized for your current server-derived role.
			</p>
		);
	}
	if (state.status === "unavailable") {
		return (
			<p className="notice storeops-unavailable" role="alert">
				Availability could not be loaded. This is a load failure, not an empty day.
			</p>
		);
	}
	if (state.board.staff.length === 0) {
		return <p className="storeops-empty">No staff are recorded in this scope for {state.date}.</p>;
	}
	return (
		<ul className="storeops-list storeops-availability-board" data-time-zone={state.board.timeZone}>
			{state.board.staff.map((entry) => {
				const row = deriveAvailabilityRow(state.board.items, entry.membershipId, state.date);
				return (
					<AvailabilityRowSurface
						key={entry.membershipId}
						displayName={entry.displayName}
						row={row}
					/>
				);
			})}
		</ul>
	);
}

export function AvailabilityEditor({
	staffMembershipId,
	displayName,
	date,
	current,
	onSubmit,
}: {
	staffMembershipId: string;
	displayName: string;
	date: string;
	current?: AvailabilityDTO;
	onSubmit: (draft: AvailabilityDraft) => Promise<StoreOpsWriteOutcome<AvailabilityDTO>>;
}) {
	const [status, setStatus] = useState<AvailabilityStatus>(current?.status ?? "published");
	const [windows, setWindows] = useState<AvailabilityWindow[]>(current?.windows ?? []);
	const [feedback, setFeedback] = useState<AvailabilityFeedback>({ kind: "idle" });
	const [busy, setBusy] = useState(false);
	const lifecycle = useRef(new StoreOpsSubmitLifecycle());

	useEffect(() => () => lifecycle.current.invalidate(), []);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const token = lifecycle.current.begin();
		if (token === undefined) return;
		if (status === "published") {
			const invalid = validateWindows(windows);
			if (invalid) {
				lifecycle.current.complete(token);
				setFeedback({ kind: "invalid", message: windowErrorMessages[invalid] });
				return;
			}
		}
		setBusy(true);
		setFeedback({ kind: "saving" });
		const outcome = await onSubmit({
			staffMembershipId,
			date,
			expectedVersion: current ? current.version : 0,
			windows: status === "published" ? windows : [],
			status,
		});
		if (!lifecycle.current.complete(token)) return;
		setBusy(false);
		setFeedback(feedbackFor(outcome));
	}

	return (
		<form className="storeops-avail-editor" onSubmit={(event) => void submit(event)} aria-label={`Edit availability for ${displayName}`}>
			<label>
				Status
				<select value={status} onChange={(event) => setStatus(event.target.value as AvailabilityStatus)}>
					<option value="published">published</option>
					<option value="withdrawn">withdrawn</option>
				</select>
			</label>
			{status === "published" ? (
				<div className="storeops-window-editor">
					{windows.map((window, index) => (
						<div key={`${window.start}-${window.end}-${index}`}>
							<input
								type="time"
								aria-label="Window start"
								value={window.start}
								onChange={(event) => setWindows(withWindow(index, { ...window, start: event.target.value }))}
							/>
							<input
								type="time"
								aria-label="Window end"
								value={window.end}
								onChange={(event) => setWindows(withWindow(index, { ...window, end: event.target.value }))}
							/>
							<button type="button" onClick={() => setWindows(windows.filter((_, i) => i !== index))}>
								Remove
							</button>
						</div>
					))}
					<button type="button" onClick={() => setWindows([...windows, { start: "09:00", end: "10:00" }])}>
						Add window
					</button>
				</div>
			) : null}
			<AvailabilityFeedbackNotice feedback={feedback} />
			<button type="submit" disabled={busy}>
				{busy ? "Saving…" : "Save availability"}
			</button>
		</form>
	);

	function withWindow(index: number, next: AvailabilityWindow): AvailabilityWindow[] {
		return windows.map((window, i) => (i === index ? next : window));
	}
}

function feedbackFor(outcome: StoreOpsWriteOutcome<AvailabilityDTO>): AvailabilityFeedback {
	switch (outcome.kind) {
		case "success":
			return { kind: "idle" };
		case "conflict":
			return { kind: "conflict", message: outcome.message };
		case "not_found":
			return { kind: "not_found", message: outcome.message };
		case "forbidden":
			return { kind: "forbidden", message: "Saving availability is not authorized for your current role." };
		case "session-invalidated":
			return { kind: "error", message: "Your session expired while saving." };
		default:
			return { kind: "error", message: outcome.message };
	}
}

export function TodayAvailabilityView({
	api,
	actor,
	initialDate,
	onSessionInvalidated,
	onAuthorizationError,
}: {
	api: SessionApi;
	actor: StoreOpsActor;
	initialDate?: string;
	onSessionInvalidated?: () => void;
	onAuthorizationError?: () => void;
}) {
	const [date, setDate] = useState<string>(initialDate ?? localDateIn());
	const [state, setState] = useState<AvailabilityState>({ status: "loading" });
	const lifecycle = useRef(new StoreOpsReadLifecycle());

	useEffect(() => {
		const token = lifecycle.current.begin();
		setState({ status: "loading" });
		void loadAvailability(api, date).then((outcome) => {
			if (!lifecycle.current.complete(token)) return;
			if (outcome.kind === "success") {
				// Correct the probe date once using the authoritative server timeZone (never browser authority).
				const serverToday = localDateIn(outcome.value.timeZone);
				if (!initialDate && serverToday !== date) {
					setDate(serverToday);
					return;
				}
				setState({ status: "ready", board: outcome.value, date });
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
	}, [api, date, initialDate]);

	async function handleSubmit(draft: AvailabilityDraft): Promise<StoreOpsWriteOutcome<AvailabilityDTO>> {
		const outcome = await saveAvailability(api, draft);
		if (outcome.kind === "session-invalidated") {
			setState({ status: "unavailable" });
			onSessionInvalidated?.();
			return outcome;
		}
		if (outcome.kind === "forbidden") onAuthorizationError?.();
		// Success and 409 conflict both reload the board; a conflict is never silently retried or overwritten.
		if (outcome.kind === "success" || outcome.kind === "conflict") {
			const token = lifecycle.current.begin();
			const reloaded = await loadAvailability(api, draft.date);
			if (lifecycle.current.complete(token) && reloaded.kind === "success") {
				setState({ status: "ready", board: reloaded.value, date: draft.date });
			}
		}
		return outcome;
	}

	if (!canWriteAvailability(actor)) return <TodayAvailabilitySurface state={state} actor={actor} />;
	return (
		<section className="storeops-availability-with-editor">
			<TodayAvailabilitySurface state={state} actor={actor} />
			{state.status === "ready" ? (
				<div className="storeops-avail-editors">
					{state.board.staff.map((entry) => {
						const row = deriveAvailabilityRow(state.board.items, entry.membershipId, state.date);
						return (
							<AvailabilityEditor
								key={`${entry.membershipId}:${state.date}`}
								staffMembershipId={entry.membershipId}
								displayName={entry.displayName}
								date={state.date}
								current={row.item}
								onSubmit={handleSubmit}
							/>
						);
					})}
				</div>
			) : null}
		</section>
	);
}
