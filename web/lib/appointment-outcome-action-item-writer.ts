import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';

import {
  createActionItem,
  type CreateActionItemResult,
} from './action-item-store';
import type { ActionItemDisplayContext } from './action-item-types';

/**
 * Writer for the appointment-outcome action-item lane. Phase 2 follow-up
 * — Close-the-sale ritual & funnel polish. Fired by the day-after cron
 * at `/api/cron/appointment-outcome-day-after` when a booked
 * appointment's `scheduledAt` has elapsed without the auto-complete
 * path (sale or convert) flipping it from `'scheduled'` to a resolved
 * state and without the agent manually marking it from the
 * LeadDetailPanel.
 *
 * Why we need the cron at all: when an agent runs a sit that doesn't
 * end in a sale, nothing in the system knows the meeting happened. The
 * appointment doc sits at `status: 'scheduled'` forever, the funnel
 * data is wrong (showed is undercounted, close rate is overstated),
 * and the agent has to remember to go back and mark it. The cron + this
 * action item put the prompt in the agent's inbox the next morning so
 * the funnel data stays honest without the agent having to think about
 * it.
 *
 * Idempotency: doc id is `appointment_outcome:{appointmentId}` so a
 * re-run of the cron — or a manual hit on the endpoint — collapses to
 * the existing pending/completed doc instead of creating a duplicate.
 * The cron is safe to invoke arbitrarily often as a result.
 *
 * Completion path: the AppointmentOutcomeActionItemCard renders the
 * lane's suggested actions as four outcome buttons + skip. Each
 * outcome button PATCHes the underlying `agents/{agentId}/appointments/{apptId}`
 * doc with the chosen `status` value, then POSTs to
 * `/api/agent/action-items/{itemId}/complete` with the matching
 * `mark_outcome_*` completionAction. The completionAction vocabulary
 * doubles as PostHog telemetry — we want to know which outcome agents
 * pick most often, not just "they marked something."
 */

const APPOINTMENT_OUTCOME_LANE = 'appointment_outcome' as const;
const APPOINTMENT_OUTCOME_TRIGGER = 'appointment_outcome_day_after' as const;
const APPOINTMENT_OUTCOME_ENTITY_TYPE = 'appointment' as const;

function idempotencyKeyForAppointment(appointmentId: string): string {
  return `appointment_outcome:${appointmentId}`;
}

export interface QueueAppointmentOutcomeItemParams {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  appointmentId: string;
  /**
   * Subject identity at appointment time. We snapshot at item creation
   * so the card has everything it needs even if the lead or client
   * record changes downstream. Names matched the `formatClientDisplayName`
   * / lead.name conventions used elsewhere.
   */
  subjectName: string;
  subjectFirstName: string;
  subjectPhoneE164: string | null;
  /** Set when the subject is already a client (lead converted). Null otherwise. */
  clientId: string | null;
  /**
   * When the meeting was scheduled. Surfaces on the card as
   * "your meeting yesterday at 2pm" context so the agent can recall
   * what happened without clicking into the lead.
   */
  scheduledAt: Timestamp;
  /**
   * Short timezone label captured from the appointment doc's
   * `agentTimezone` (IANA) → short form (e.g., "CT"). Optional —
   * the card falls back to UTC formatting if missing.
   */
  scheduledTzShort: string | null;
}

export async function queueAppointmentOutcomeActionItem(
  params: QueueAppointmentOutcomeItemParams,
): Promise<CreateActionItemResult> {
  const displayContext: ActionItemDisplayContext = {
    subjectName: params.subjectName || null,
    subjectFirstName: params.subjectFirstName || null,
    subjectPhoneE164: params.subjectPhoneE164,
    appointmentScheduledAt: params.scheduledAt.toDate().toISOString(),
    appointmentScheduledTzShort: params.scheduledTzShort,
  };

  return createActionItem({
    db: params.db,
    agentId: params.agentId,
    lane: APPOINTMENT_OUTCOME_LANE,
    triggerReason: APPOINTMENT_OUTCOME_TRIGGER,
    clientId: params.clientId,
    prospectId: null,
    linkedEntityType: APPOINTMENT_OUTCOME_ENTITY_TYPE,
    linkedEntityId: params.appointmentId,
    displayContext,
    idempotencyKey: idempotencyKeyForAppointment(params.appointmentId),
  });
}
