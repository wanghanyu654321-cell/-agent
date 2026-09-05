/**
 * Track C public surface. Final Integration mounts `StoreOpsConsole` into `web/src/App.tsx`; the
 * individual views, surfaces and pure helpers are exported for deterministic frontend tests.
 */

export { StoreOpsConsole } from "./storeops.tsx";

export {
	type AvailabilityBoardDTO,
	type AvailabilityDTO,
	type AvailabilityStatus,
	type AvailabilityWindow,
	type BoundedListDTO,
	type BookingIntentAction,
	type BookingIntentDTO,
	type BookingIntentStatus,
	type KnowledgeDTO,
	type NeedsAttentionDTO,
	type StaffDirectoryEntry,
	isAvailabilityDTO,
	isBookingIntentDTO,
	isKnowledgeDTO,
	isNeedsAttentionDTO,
	parseAvailabilityBoard,
	parseAvailabilityDTO,
	parseBookingIntentDTO,
	parseBookingIntentList,
	parseKnowledgeList,
	parseNeedsAttentionList,
	validateWindows,
	type WindowValidationError,
} from "./dto.ts";

export {
	bookingActionNeedsInterval,
	canCreateBookingIntent,
	canManageBookingIntent,
	canReadStoreOps,
	canViewNeedsAttention,
	canWriteAvailability,
	permittedBookingActions,
	type StoreOpsActor,
} from "./authority.ts";

export {
	STOREOPS_BASE,
	type AvailabilityDraft,
	type BookingIntentDraft,
	type BookingTransitionDraft,
	type CreateBookingOutcome,
	type StoreOpsReadOutcome,
	type StoreOpsWriteOutcome,
	createBookingIntent,
	loadAvailability,
	loadBookingIntents,
	loadKnowledge,
	loadNeedsAttention,
	newIdempotencyKey,
	saveAvailability,
	transitionBookingIntent,
} from "./api.ts";

export { StoreOpsReadLifecycle, StoreOpsSubmitLifecycle } from "./lifecycle.ts";

export {
	type AvailabilityFeedback,
	type AvailabilityRowState,
	type AvailabilityState,
	AvailabilityEditor,
	AvailabilityFeedbackNotice,
	AvailabilityRowSurface,
	deriveAvailabilityRow,
	localDateIn,
	TodayAvailabilitySurface,
	TodayAvailabilityView,
} from "./availability.tsx";

export {
	type BookingFeedback,
	type BookingIntentsState,
	BookingFeedbackNotice,
	BookingIntentActionControl,
	BookingIntentCreateForm,
	BookingIntentRow,
	BookingIntentsSurface,
	BookingIntentsView,
} from "./booking-intents.tsx";

export { type KnowledgeState, KnowledgeEvidenceSurface, KnowledgeEvidenceView } from "./knowledge.tsx";

export { type NeedsAttentionState, NeedsAttentionSurface, NeedsAttentionView } from "./needs-attention.tsx";
