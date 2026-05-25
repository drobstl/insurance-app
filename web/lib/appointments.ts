/**
 * Lead appointment registry.
 *
 * Stored at `agents/{agentId}/appointments/{apptId}` (top-level under
 * the agent, NOT nested under the lead) so day-of cron jobs and a
 * future "today's appointments" dashboard view can scan a single
 * subcollection per agent without iterating every lead.
 *
 * Each appointment carries a back-reference to its `leadId` so the
 * lead-detail page filters by `where('leadId', '==', leadId)`.
 *
 * Status lifecycle:
 *   scheduled              → default on create
 *   completed              → set by the auto-complete-on-sale/convert path;
 *                            paired with the lead's convertedToClientId, this
 *                            is the "Sold" sit. Agents don't pick this manually
 *                            anymore — they pick one of the explicit sit_*
 *                            values below or land here via the sale path.
 *   sit_no_sale            → meeting happened, didn't close
 *   sit_think_about_it     → meeting happened, lead is deliberating
 *   cancelled              → marked before/at appointment time
 *   no_show                → marked when the lead doesn't appear
 *
 * sentConfirmationAt + sentReminderAt are stamped by the booking-
 * confirmation + reminder flows (Chunk 4e + 4f).
 */

export type AppointmentStatus =
  | 'scheduled'
  | 'completed'
  | 'sit_no_sale'
  | 'sit_think_about_it'
  | 'cancelled'
  | 'no_show';

export interface AppointmentDoc {
  id: string;
  leadId: string;
  leadName: string;
  leadPhone: string;
  leadState?: string | null;       // 2-letter USPS code; used by 4e to pick license
  scheduledAt: FirebaseFirestore.Timestamp | null;
  /**
   * IANA TZ name captured from the agent's browser at booking time
   * (e.g. "America/Chicago"). Anchors the wall-clock time so a
   * traveling agent and the lead see the same rendering. Google
   * Calendar event is created with this `timeZone`. Optional for
   * back-compat with appointments booked before TZ capture shipped —
   * those fall back to the agent's current browser TZ.
   */
  scheduledAtTimeZone?: string | null;
  durationMinutes: number;
  notes?: string;
  status: AppointmentStatus;
  createdAt: FirebaseFirestore.Timestamp | null;
  sentConfirmationAt?: FirebaseFirestore.Timestamp | null;
  sentReminderAt?: FirebaseFirestore.Timestamp | null;
  /**
   * Stamped by the appointment-push-reminders cron (Chunk 4f-extension)
   * when it successfully sends an Expo push to the lead's app on file.
   * Separate from sentReminderAt (which tracks the agent-sent SMS) so
   * the two channels never collide.
   */
  reminderPushSentAt?: FirebaseFirestore.Timestamp | null;
  /** Google Calendar event ID — present iff the appointment has been mirrored. */
  googleEventId?: string | null;
  /** Last Calendar sync failure message; null/absent when the last sync succeeded. */
  googleCalendarSyncError?: string | null;
  /**
   * Per-appointment meeting URL (Zoom personal room, Google Meet
   * permalink, or an auto-generated Meet link). When set, appended to
   * the SMS confirmation/reminder body. Absent for phone appointments.
   */
  meetingUrl?: string | null;
  /**
   * Whether to add the lead as an attendee on the Google Calendar
   * event — Google sends them a real invite via email with the Meet
   * link, native RSVP, and reminders. Captured at booking time.
   */
  inviteLeadByEmail?: boolean | null;
  /** Lead's email at booking time. Snapshotted for the Calendar attendee. */
  leadEmail?: string | null;
}

export const DEFAULT_DURATION_MINUTES = 30;
export const VALID_STATUSES: AppointmentStatus[] = [
  'scheduled',
  'completed',
  'sit_no_sale',
  'sit_think_about_it',
  'cancelled',
  'no_show',
];

/**
 * Statuses where the meeting actually happened — used by show-rate
 * stats and the "did the sit go down" UI affordances. `completed` is
 * the Sold sit (auto-set via sale/convert paths); the explicit
 * sit_* values are agent-marked.
 */
export const SIT_HAPPENED_STATUSES: AppointmentStatus[] = [
  'completed',
  'sit_no_sale',
  'sit_think_about_it',
];

export function isValidIsoTimestamp(s: string): boolean {
  if (!s) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime()) && d.toISOString() === s;
}
