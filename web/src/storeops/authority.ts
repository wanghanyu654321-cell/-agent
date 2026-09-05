import type { BookingIntentAction, BookingIntentDTO, BookingIntentStatus } from "./dto.ts";

/**
 * Capability/role authority gates derived from ARCHITECTURE_CONTRACT.md sections 3, 4.4 and 4.5.
 * Authority is always server-derived; these helpers only decide which controls the UI may render so
 * the console never fabricates an action the backend would reject. They never grant authority.
 */

export interface StoreOpsActor {
	userId: string;
	role: string;
	capabilities: readonly string[];
}

export function canReadStoreOps(actor: StoreOpsActor): boolean {
	return actor.capabilities.includes("storeops:read");
}

export function canWriteAvailability(actor: StoreOpsActor): boolean {
	return actor.capabilities.includes("availability:write");
}

export function canCreateBookingIntent(actor: StoreOpsActor): boolean {
	return actor.capabilities.includes("booking-intent:create");
}

export function canManageBookingIntent(actor: StoreOpsActor): boolean {
	return actor.capabilities.includes("booking-intent:manage");
}

/** Section 4.5: the reduced Needs Attention projection is supervisor/admin only; agent access is forbidden. */
export function canViewNeedsAttention(actor: StoreOpsActor): boolean {
	return canReadStoreOps(actor) && (actor.role === "supervisor" || actor.role === "admin");
}

const actionOrder: BookingIntentAction[] = ["confirm", "propose_alternative", "cancel"];

function mayCancel(actor: StoreOpsActor, intent: BookingIntentDTO): boolean {
	if (intent.status === "cancelled") return false;
	if (canManageBookingIntent(actor)) {
		return (
			intent.status === "pending_confirmation" ||
			intent.status === "alternative_proposed" ||
			intent.status === "confirmed"
		);
	}
	// Ownership-limited use of booking-intent:create: an agent may cancel only their own still-pending intent.
	return (
		intent.status === "pending_confirmation" &&
		canCreateBookingIntent(actor) &&
		intent.createdByUserId === actor.userId
	);
}

/**
 * Returns exactly the actions the contract permits for this intent/actor, in a stable order.
 * confirm: manage + (pending | alternative_proposed); propose_alternative: manage + pending;
 * cancel: manage + (pending | alternative_proposed | confirmed) or creator-agent on own pending.
 * A cancelled intent is terminal and permits nothing.
 */
export function permittedBookingActions(actor: StoreOpsActor, intent: BookingIntentDTO): BookingIntentAction[] {
	if (intent.status === "cancelled") return [];
	const allowed = new Set<BookingIntentAction>();
	if (canManageBookingIntent(actor)) {
		if (intent.status === "pending_confirmation" || intent.status === "alternative_proposed") allowed.add("confirm");
		if (intent.status === "pending_confirmation") allowed.add("propose_alternative");
	}
	if (mayCancel(actor, intent)) allowed.add("cancel");
	return actionOrder.filter((action) => allowed.has(action));
}

/**
 * Section 4.4/7 interval rules: confirm-from-pending requires an explicit final pair;
 * confirm-from-alternative reuses the stored alternative with no new pair; propose requires a pair;
 * cancel forbids a pair.
 */
export function bookingActionNeedsInterval(action: BookingIntentAction, status: BookingIntentStatus): boolean {
	if (action === "propose_alternative") return true;
	if (action === "cancel") return false;
	return status === "pending_confirmation";
}
