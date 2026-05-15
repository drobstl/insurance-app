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
 *   scheduled   → default on create
 *   completed   → manually marked by the agent after the appointment
 *   cancelled   → manually marked by the agent before/at appointment time
 *   no_show     → manually marked when the lead doesn't appear
 *
 * sentConfirmationAt + sentReminderAt are stamped by the booking-
 * confirmation + reminder flows (Chunk 4e + 4f).
 */

export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';

export interface AppointmentDoc {
  id: string;
  leadId: string;
  leadName: string;
  leadPhone: string;
  leadState?: string | null;       // 2-letter USPS code; used by 4e to pick license
  scheduledAt: FirebaseFirestore.Timestamp | null;
  durationMinutes: number;
  notes?: string;
  status: AppointmentStatus;
  createdAt: FirebaseFirestore.Timestamp | null;
  sentConfirmationAt?: FirebaseFirestore.Timestamp | null;
  sentReminderAt?: FirebaseFirestore.Timestamp | null;
}

export const DEFAULT_DURATION_MINUTES = 30;
export const VALID_STATUSES: AppointmentStatus[] = ['scheduled', 'completed', 'cancelled', 'no_show'];

export function isValidIsoTimestamp(s: string): boolean {
  if (!s) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime()) && d.toISOString() === s;
}
