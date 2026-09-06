export class StoreOpsError extends Error {
	constructor(
		public readonly code:
			| "invalid_request"
			| "forbidden"
			| "not_found"
			| "availability_conflict"
			| "booking_intent_conflict"
			| "dependency_unavailable",
	) {
		super(code);
	}
}
export type BookingStatus = "pending_confirmation" | "confirmed" | "alternative_proposed" | "cancelled";
export interface AvailabilityDTO {
	id: string;
	staffMembershipId: string;
	staffDisplayName: string;
	localDate: string;
	timeZone: string;
	windows: { start: string; end: string }[];
	status: "published" | "withdrawn";
	source: "human";
	version: number;
	updatedAt: string;
}
export interface BookingIntentDTO {
	id: string;
	conversationId: string;
	customerId: string;
	requestedService: string;
	requestedStart: string | null;
	requestedEnd: string | null;
	preferredStaffMembershipId: string | null;
	status: BookingStatus;
	alternativeStart: string | null;
	alternativeEnd: string | null;
	confirmedStart: string | null;
	confirmedEnd: string | null;
	createdByUserId: string;
	version: number;
	createdAt: string;
	updatedAt: string;
}
export interface NeedsAttentionDTO {
	conversationId: string;
	basis: "fallback" | "durable_handoff";
	handoffId: string | null;
	lastActivityAt: string;
}
export interface AvailabilityWrite {
	expectedVersion: number;
	windows: { start: string; end: string }[];
	status: "published" | "withdrawn";
}
export interface BookingCreate {
	conversationId: string;
	requestedService: string;
	requestedStart?: string;
	requestedEnd?: string;
	preferredStaffMembershipId?: string;
}
export interface BookingTransition {
	expectedVersion: number;
	action: "confirm" | "propose_alternative" | "cancel";
	start?: string;
	end?: string;
}

function object(value: unknown, keys: string[]): Record<string, unknown> {
	if (
		!value ||
		typeof value !== "object" ||
		Array.isArray(value) ||
		Object.keys(value).some((key) => !keys.includes(key))
	)
		throw new StoreOpsError("invalid_request");
	return value as Record<string, unknown>;
}
export function boundedId(value: unknown): string {
	if (typeof value !== "string" || !value.trim() || Array.from(value).length > 200)
		throw new StoreOpsError("invalid_request");
	return value;
}
export function validateDate(value: unknown): string {
	if (
		typeof value !== "string" ||
		!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
		!Number.isFinite(Date.parse(value)) ||
		new Date(value).toISOString().slice(0, 10) !== value
	)
		throw new StoreOpsError("invalid_request");
	return value;
}
export function validateTimeZone(value: unknown): string {
	if (typeof value !== "string" || !value) throw new StoreOpsError("dependency_unavailable");
	try {
		new Intl.DateTimeFormat("en", { timeZone: value });
	} catch {
		throw new StoreOpsError("dependency_unavailable");
	}
	return value;
}
function version(value: unknown, minimum: number): number {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum)
		throw new StoreOpsError("invalid_request");
	return value;
}
function instant(value: unknown): string {
	if (
		typeof value !== "string" ||
		!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) ||
		!Number.isFinite(Date.parse(value))
	)
		throw new StoreOpsError("invalid_request");
	validateDate(value.slice(0, 10));
	if (!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d/.test(value.slice(11))) throw new StoreOpsError("invalid_request");
	return new Date(value).toISOString();
}
function pair(start: unknown, end: unknown): [string | undefined, string | undefined] {
	if (start === undefined && end === undefined) return [undefined, undefined];
	const a = instant(start),
		b = instant(end);
	if (a >= b) throw new StoreOpsError("invalid_request");
	return [a, b];
}
export function parseAvailabilityWrite(date: string, input: unknown): AvailabilityWrite {
	validateDate(date);
	const data = object(input, ["expectedVersion", "windows", "status"]);
	if (
		!Array.isArray(data.windows) ||
		data.windows.length > 24 ||
		!["published", "withdrawn"].includes(String(data.status))
	)
		throw new StoreOpsError("invalid_request");
	let previous = "";
	const windows = data.windows.map((value) => {
		const window = object(value, ["start", "end"]);
		if (
			typeof window.start !== "string" ||
			typeof window.end !== "string" ||
			!/^([01]\d|2[0-3]):[0-5]\d$/.test(window.start) ||
			!/^([01]\d|2[0-3]):[0-5]\d$/.test(window.end) ||
			window.start >= window.end ||
			window.start < previous
		)
			throw new StoreOpsError("invalid_request");
		previous = window.end;
		return { start: window.start, end: window.end };
	});
	return {
		expectedVersion: version(data.expectedVersion, 0),
		windows,
		status: data.status as AvailabilityWrite["status"],
	};
}
export function parseBookingCreate(input: unknown): BookingCreate {
	const data = object(input, [
		"conversationId",
		"requestedService",
		"requestedStart",
		"requestedEnd",
		"preferredStaffMembershipId",
	]);
	const [requestedStart, requestedEnd] = pair(data.requestedStart, data.requestedEnd);
	return {
		conversationId: boundedId(data.conversationId),
		requestedService: boundedId(data.requestedService),
		...(requestedStart ? { requestedStart, requestedEnd } : {}),
		...(data.preferredStaffMembershipId !== undefined
			? { preferredStaffMembershipId: boundedId(data.preferredStaffMembershipId) }
			: {}),
	};
}
export function parseBookingTransition(input: unknown): BookingTransition {
	const data = object(input, ["expectedVersion", "action", "start", "end"]);
	if (!["confirm", "propose_alternative", "cancel"].includes(String(data.action)))
		throw new StoreOpsError("invalid_request");
	const [start, end] = pair(data.start, data.end);
	if ((data.action === "cancel" && start) || (data.action === "propose_alternative" && !start))
		throw new StoreOpsError("invalid_request");
	return {
		expectedVersion: version(data.expectedVersion, 1),
		action: data.action as BookingTransition["action"],
		...(start ? { start, end } : {}),
	};
}
export function resolveTransition(
	status: BookingStatus,
	alternativeStart: string | null,
	alternativeEnd: string | null,
	input: BookingTransition,
): {
	status: BookingStatus;
	confirmedStart?: string;
	confirmedEnd?: string;
	alternativeStart?: string;
	alternativeEnd?: string;
} {
	if (status === "cancelled" || (status === "confirmed" && input.action !== "cancel"))
		throw new StoreOpsError("booking_intent_conflict");
	if (input.action === "cancel") return { status: "cancelled" };
	if (input.action === "propose_alternative") {
		if (status !== "pending_confirmation") throw new StoreOpsError("booking_intent_conflict");
		if (!input.start || !input.end) throw new StoreOpsError("invalid_request");
		return { status: "alternative_proposed", alternativeStart: input.start, alternativeEnd: input.end };
	}
	if (status === "alternative_proposed") {
		if (input.start || input.end || !alternativeStart || !alternativeEnd) throw new StoreOpsError("invalid_request");
		return { status: "confirmed", confirmedStart: alternativeStart, confirmedEnd: alternativeEnd };
	}
	if (!input.start || !input.end) throw new StoreOpsError("invalid_request");
	return { status: "confirmed", confirmedStart: input.start, confirmedEnd: input.end };
}
