/**
 * Frozen React-facing StoreOps DTOs from ARCHITECTURE_CONTRACT.md section 7.
 * These shapes are contract-frozen `job-ready-v1`. Track C MUST NOT add, rename
 * or invent fields; parsers fail closed on unknown/malformed keys so an unstated
 * backend field is never silently consumed as authority.
 */

export type AvailabilityStatus = "published" | "withdrawn";
export type AvailabilityWindow = { start: string; end: string };

export interface AvailabilityDTO {
	id: string;
	staffMembershipId: string;
	staffDisplayName: string;
	localDate: string;
	timeZone: string;
	windows: AvailabilityWindow[];
	status: AvailabilityStatus;
	source: "human";
	version: number;
	updatedAt: string;
}

export interface StaffDirectoryEntry {
	membershipId: string;
	displayName: string;
}

/** GET /availability returns items plus the same-scope staff roster and the server-owned timeZone. */
export interface AvailabilityBoardDTO {
	items: AvailabilityDTO[];
	staff: StaffDirectoryEntry[];
	timeZone: string;
}

export type BookingIntentStatus = "pending_confirmation" | "confirmed" | "alternative_proposed" | "cancelled";
export type BookingIntentAction = "confirm" | "propose_alternative" | "cancel";

export interface BookingIntentDTO {
	id: string;
	conversationId: string;
	customerId: string;
	requestedService: string;
	requestedStart: string | null;
	requestedEnd: string | null;
	preferredStaffMembershipId: string | null;
	status: BookingIntentStatus;
	alternativeStart: string | null;
	alternativeEnd: string | null;
	confirmedStart: string | null;
	confirmedEnd: string | null;
	createdByUserId: string;
	version: number;
	createdAt: string;
	updatedAt: string;
}

export type KnowledgeKind = "faq" | "policy" | "sop" | "reference";

export interface KnowledgeDTO {
	id: string;
	kind: KnowledgeKind;
	title: string;
	version: string;
	sourceRef: string;
	updatedAt: string;
	status: "approved";
}

export type NeedsAttentionBasis = "fallback" | "durable_handoff";

export interface NeedsAttentionDTO {
	conversationId: string;
	basis: NeedsAttentionBasis;
	handoffId: string | null;
	lastActivityAt: string;
}

/** Booking / Needs Attention lists are server-bounded to the latest 100 with an optional truncated flag. */
export interface BoundedListDTO<T> {
	items: T[];
	truncated?: boolean;
}

const availabilityStatuses = new Set<AvailabilityStatus>(["published", "withdrawn"]);
const bookingIntentStatuses = new Set<BookingIntentStatus>([
	"pending_confirmation",
	"confirmed",
	"alternative_proposed",
	"cancelled",
]);
const knowledgeKinds = new Set<KnowledgeKind>(["faq", "policy", "sop", "reference"]);
const needsAttentionBases = new Set<NeedsAttentionBasis>(["fallback", "durable_handoff"]);

const clockPattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const localDatePattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const instantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function isClockTime(value: unknown): value is string {
	return typeof value === "string" && clockPattern.test(value);
}

export function isLocalDate(value: unknown): value is string {
	return typeof value === "string" && localDatePattern.test(value);
}

export function isInstant(value: unknown): value is string {
	return typeof value === "string" && instantPattern.test(value);
}

function isNonemptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

function isNullableInstant(value: unknown): boolean {
	return value === null || isInstant(value);
}

function isPositiveInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Rejects any key outside the frozen contract so a leaked provider/audit field never repaints. */
function hasExactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
	const keys = Object.keys(value);
	return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function isAvailabilityWindow(value: unknown): value is AvailabilityWindow {
	if (!isRecord(value) || !hasExactKeys(value, ["start", "end"])) return false;
	return isClockTime(value.start) && isClockTime(value.end);
}

export function isAvailabilityDTO(value: unknown): value is AvailabilityDTO {
	if (!isRecord(value)) return false;
	const allowed = [
		"id",
		"staffMembershipId",
		"staffDisplayName",
		"localDate",
		"timeZone",
		"windows",
		"status",
		"source",
		"version",
		"updatedAt",
	];
	if (!hasExactKeys(value, allowed)) return false;
	return (
		isNonemptyString(value.id) &&
		isNonemptyString(value.staffMembershipId) &&
		isNonemptyString(value.staffDisplayName) &&
		isLocalDate(value.localDate) &&
		isNonemptyString(value.timeZone) &&
		Array.isArray(value.windows) &&
		value.windows.length <= 24 &&
		value.windows.every(isAvailabilityWindow) &&
		availabilityStatuses.has(value.status as AvailabilityStatus) &&
		value.source === "human" &&
		isPositiveInteger(value.version) &&
		isInstant(value.updatedAt)
	);
}

function isStaffDirectoryEntry(value: unknown): value is StaffDirectoryEntry {
	if (!isRecord(value) || !hasExactKeys(value, ["membershipId", "displayName"])) return false;
	return isNonemptyString(value.membershipId) && isNonemptyString(value.displayName);
}

export function parseAvailabilityBoard(value: unknown): AvailabilityBoardDTO | undefined {
	if (!isRecord(value) || !hasExactKeys(value, ["items", "staff", "timeZone"])) return undefined;
	if (!isNonemptyString(value.timeZone)) return undefined;
	if (!Array.isArray(value.items) || !value.items.every(isAvailabilityDTO)) return undefined;
	if (!Array.isArray(value.staff) || !value.staff.every(isStaffDirectoryEntry)) return undefined;
	return {
		items: value.items.map((item) => cloneAvailability(item as AvailabilityDTO)),
		staff: value.staff.map((entry) => ({ ...entry })) as StaffDirectoryEntry[],
		timeZone: value.timeZone,
	};
}

function cloneAvailability(item: AvailabilityDTO): AvailabilityDTO {
	return { ...item, windows: item.windows.map((window) => ({ ...window })) };
}

export function parseAvailabilityDTO(value: unknown): AvailabilityDTO | undefined {
	return isAvailabilityDTO(value) ? cloneAvailability(value) : undefined;
}

export function isBookingIntentDTO(value: unknown): value is BookingIntentDTO {
	if (!isRecord(value)) return false;
	const allowed = [
		"id",
		"conversationId",
		"customerId",
		"requestedService",
		"requestedStart",
		"requestedEnd",
		"preferredStaffMembershipId",
		"status",
		"alternativeStart",
		"alternativeEnd",
		"confirmedStart",
		"confirmedEnd",
		"createdByUserId",
		"version",
		"createdAt",
		"updatedAt",
	];
	if (!hasExactKeys(value, allowed)) return false;
	return (
		isNonemptyString(value.id) &&
		isNonemptyString(value.conversationId) &&
		isNonemptyString(value.customerId) &&
		isNonemptyString(value.requestedService) &&
		isNullableInstant(value.requestedStart) &&
		isNullableInstant(value.requestedEnd) &&
		(value.preferredStaffMembershipId === null || isNonemptyString(value.preferredStaffMembershipId)) &&
		bookingIntentStatuses.has(value.status as BookingIntentStatus) &&
		isNullableInstant(value.alternativeStart) &&
		isNullableInstant(value.alternativeEnd) &&
		isNullableInstant(value.confirmedStart) &&
		isNullableInstant(value.confirmedEnd) &&
		isNonemptyString(value.createdByUserId) &&
		isPositiveInteger(value.version) &&
		isInstant(value.createdAt) &&
		isInstant(value.updatedAt)
	);
}

export function parseBookingIntentDTO(value: unknown): BookingIntentDTO | undefined {
	return isBookingIntentDTO(value) ? { ...value } : undefined;
}

export function isKnowledgeDTO(value: unknown): value is KnowledgeDTO {
	if (!isRecord(value)) return false;
	const allowed = ["id", "kind", "title", "version", "sourceRef", "updatedAt", "status"];
	if (!hasExactKeys(value, allowed)) return false;
	return (
		isNonemptyString(value.id) &&
		knowledgeKinds.has(value.kind as KnowledgeKind) &&
		isNonemptyString(value.title) &&
		isNonemptyString(value.version) &&
		isNonemptyString(value.sourceRef) &&
		isInstant(value.updatedAt) &&
		value.status === "approved"
	);
}

export function isNeedsAttentionDTO(value: unknown): value is NeedsAttentionDTO {
	if (!isRecord(value)) return false;
	const allowed = ["conversationId", "basis", "handoffId", "lastActivityAt"];
	if (!hasExactKeys(value, allowed)) return false;
	return (
		isNonemptyString(value.conversationId) &&
		needsAttentionBases.has(value.basis as NeedsAttentionBasis) &&
		(value.handoffId === null || isNonemptyString(value.handoffId)) &&
		isInstant(value.lastActivityAt)
	);
}

function parseBoundedList<T>(value: unknown, isItem: (item: unknown) => boolean): BoundedListDTO<T> | undefined {
	if (!isRecord(value)) return undefined;
	const keys = Object.keys(value);
	const allowed = keys.includes("truncated") ? ["items", "truncated"] : ["items"];
	if (!hasExactKeys(value, allowed)) return undefined;
	if (!Array.isArray(value.items) || !value.items.every(isItem)) return undefined;
	if (value.truncated !== undefined && typeof value.truncated !== "boolean") return undefined;
	const list: BoundedListDTO<T> = { items: value.items as T[] };
	if (typeof value.truncated === "boolean") list.truncated = value.truncated;
	return list;
}

export function parseBookingIntentList(value: unknown): BoundedListDTO<BookingIntentDTO> | undefined {
	return parseBoundedList<BookingIntentDTO>(value, isBookingIntentDTO);
}

export function parseKnowledgeList(value: unknown): BoundedListDTO<KnowledgeDTO> | undefined {
	return parseBoundedList<KnowledgeDTO>(value, isKnowledgeDTO);
}

export function parseNeedsAttentionList(value: unknown): BoundedListDTO<NeedsAttentionDTO> | undefined {
	return parseBoundedList<NeedsAttentionDTO>(value, isNeedsAttentionDTO);
}

export type WindowValidationError = "too_many" | "bad_format" | "end_before_start" | "overlap";

/**
 * Section 4.3 write invariants for a published human availability draft: HH:mm intervals,
 * end after start (half-open, same-day), non-overlapping, at most 24. An empty draft is valid
 * and means "no listed window"; adjacency (next start equals previous end) is allowed. Node
 * re-validates before SQL, so the client only refuses an obviously invalid draft.
 */
export function validateWindows(windows: AvailabilityWindow[]): WindowValidationError | undefined {
	if (windows.length > 24) return "too_many";
	let previousEnd: string | undefined;
	for (const window of windows) {
		if (!isClockTime(window.start) || !isClockTime(window.end)) return "bad_format";
		if (window.end <= window.start) return "end_before_start";
		if (previousEnd !== undefined && window.start < previousEnd) return "overlap";
		previousEnd = window.end;
	}
	return undefined;
}
