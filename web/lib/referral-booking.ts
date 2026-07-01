import 'server-only';

import { FieldValue, Timestamp, type Firestore, type DocumentReference } from 'firebase-admin/firestore';
import {
  createCalendarEvent,
  GoogleCalendarNotConnectedError,
  resolveGoogleCalendarAccessToken,
} from './google-calendar';

/**
 * Book a referral appointment directly (the "hands" the referral AI calls when
 * the referral picks a time). Mirrors POST /api/leads/[leadId]/appointments:
 * writes the appointment doc under agents/{agentId}/appointments, mirrors it to
 * Google Calendar (best-effort, never blocks), and flips the referral to booked.
 */
export async function bookReferralAppointment(args: {
  db: Firestore;
  agentId: string;
  referralRef: DocumentReference;
  referralId: string;
  referralName: string;
  referralPhone: string | null;
  referralEmail?: string | null;
  startIso: string;
  endIso: string;
  durationMinutes: number;
  timeZone: string;
  /** OAuth callback URL for calendar token refresh. */
  callbackUrl: string;
  /** Canonical app origin, for the appointment description link. */
  origin: string;
}): Promise<{ ok: boolean; appointmentId: string; meetingUrl: string | null }> {
  const { db, agentId, referralRef, referralId, referralName, referralPhone } = args;
  const now = Timestamp.now();
  const scheduledAt = Timestamp.fromDate(new Date(args.startIso));
  const email = (args.referralEmail || '').trim();
  const willInvite = /.+@.+\..+/.test(email);

  // 1) Appointment doc — same subcollection the reminder cron + dashboard scan.
  const apptRef = db.collection('agents').doc(agentId).collection('appointments').doc();
  await apptRef.set({
    referralId,
    source: 'referral' as const,
    leadName: referralName, // reuse the field the appointments UI already reads
    leadPhone: referralPhone || '',
    scheduledAt,
    scheduledAtTimeZone: args.timeZone,
    durationMinutes: args.durationMinutes,
    status: 'scheduled' as const,
    createdAt: now,
  });

  // 2) Mirror to Google Calendar (best-effort — Firestore is source of truth).
  let googleEventId: string | null = null;
  let meetingUrl: string | null = null;
  try {
    const { accessToken, calendarId } = await resolveGoogleCalendarAccessToken(agentId, args.callbackUrl);
    const descLines: string[] = [];
    if (referralPhone) descLines.push(`Phone: ${referralPhone}`);
    descLines.push('Booked automatically by your AgentForLife referral assistant.');
    descLines.push(`Referral in AFL: ${args.origin}/dashboard/referrals`);
    const event = await createCalendarEvent({
      accessToken,
      calendarId,
      event: {
        title: `${referralName} — Referral appointment`,
        description: descLines.join('\n'),
        startIso: args.startIso,
        endIso: args.endIso,
        timeZone: args.timeZone,
        attendees: willInvite ? [{ email, displayName: referralName }] : undefined,
        addGoogleMeet: true,
      },
    });
    googleEventId = event.id;
    if (event.hangoutLink) meetingUrl = event.hangoutLink;
    await apptRef.update({
      googleEventId,
      googleCalendarSyncError: null,
      ...(meetingUrl ? { meetingUrl } : {}),
    });
  } catch (err) {
    if (err instanceof GoogleCalendarNotConnectedError) {
      // No calendar connected — the local appointment doc still stands.
    } else {
      const msg = err instanceof Error ? err.message : 'calendar_sync_failed';
      console.error('[referral-booking] calendar mirror failed:', err);
      await apptRef.update({ googleCalendarSyncError: msg }).catch(() => {});
    }
  }

  // 3) Flip the referral to booked.
  await referralRef.update({
    status: 'booked',
    appointmentBooked: true,
    appointmentAt: scheduledAt,
    appointmentId: apptRef.id,
    ...(meetingUrl ? { appointmentMeetingUrl: meetingUrl } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { ok: true, appointmentId: apptRef.id, meetingUrl };
}
