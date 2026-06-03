import 'server-only';

import { NextRequest, NextResponse, after } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../../lib/firebase-admin';
import { DEFAULT_DURATION_MINUTES, isValidIsoTimestamp } from '../../../../../lib/appointments';
import {
  createCalendarEvent,
  GoogleCalendarNotConnectedError,
  resolveGoogleCalendarAccessToken,
} from '../../../../../lib/google-calendar';
import { buildGoogleCallbackUrl, GOOGLE_CALENDAR_CALLBACK_PATH } from '../../../../../lib/oauth-redirect';
import { pushAgentForConfirmation } from '../../../../../lib/agent-push';

/**
 * POST /api/leads/[leadId]/appointments
 *
 * Create an appointment for a lead. Atomically also logs a
 * dial-outcome of `booked` on the lead doc (`dialLog.push +
 * lastDialAt + lastDialOutcome`) so the agent doesn't need a
 * separate "log this dial too" round-trip.
 *
 * The appointment is stored at `agents/{agentId}/appointments/{apptId}`
 * (top-level under the agent, NOT nested under the lead) so the
 * 1-hour-before reminder cron and "today's appointments" dashboard
 * view can scan one subcollection per agent. The doc carries a
 * `leadId` back-reference so the lead-detail page filters by it.
 *
 * Body: { scheduledAt: ISO string, durationMinutes?: number, notes?: string }
 *
 * Auth: Bearer ID token; agent owns the lead.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ leadId: string }> },
) {
  try {
    const { leadId } = await context.params;
    if (!leadId) return NextResponse.json({ error: 'Missing leadId' }, { status: 400 });

    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    let decoded;
    try {
      decoded = await getAdminAuth().verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }
    const agentId = decoded.uid;

    const body = await req.json().catch(() => ({}));
    const scheduledAtIso = typeof body?.scheduledAt === 'string' ? body.scheduledAt.trim() : '';
    const durationMinutes = typeof body?.durationMinutes === 'number'
      ? Math.max(5, Math.min(480, Math.round(body.durationMinutes)))
      : DEFAULT_DURATION_MINUTES;
    const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 1000) : '';
    const scheduledAtTimeZone = typeof body?.scheduledAtTimeZone === 'string'
      ? body.scheduledAtTimeZone.trim().slice(0, 80)
      : '';
    const rawMeetingUrl = typeof body?.meetingUrl === 'string' ? body.meetingUrl.trim().slice(0, 500) : '';
    const inviteLeadByEmail = body?.inviteLeadByEmail === true;
    const addGoogleMeet = body?.addGoogleMeet === true;

    if (!isValidIsoTimestamp(scheduledAtIso)) {
      return NextResponse.json(
        { error: 'scheduledAt must be a valid ISO timestamp' },
        { status: 400 },
      );
    }

    const db = getAdminFirestore();
    const leadRef = db.collection('agents').doc(agentId).collection('leads').doc(leadId);
    const leadSnap = await leadRef.get();
    if (!leadSnap.exists) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }
    const leadData = leadSnap.data() ?? {};
    const leadName = typeof leadData.name === 'string' ? leadData.name : '';
    const leadPhone = typeof leadData.phone === 'string' ? leadData.phone : '';
    const leadEmail = typeof leadData.email === 'string' ? leadData.email.trim() : '';
    const leadState = (leadData.address && typeof leadData.address === 'object'
      && typeof (leadData.address as Record<string, unknown>).state === 'string')
      ? (leadData.address as Record<string, string>).state
      : null;
    // Only honor inviteLeadByEmail if we actually have an email to send to.
    const willInviteLead = inviteLeadByEmail && /.+@.+\..+/.test(leadEmail);

    const scheduledAt = Timestamp.fromDate(new Date(scheduledAtIso));
    const now = Timestamp.now();

    // Create appointment doc.
    const apptRef = db.collection('agents').doc(agentId).collection('appointments').doc();
    const appointment = {
      leadId,
      leadName,
      leadPhone,
      leadState,
      scheduledAt,
      ...(scheduledAtTimeZone ? { scheduledAtTimeZone } : {}),
      durationMinutes,
      ...(notes ? { notes } : {}),
      ...(rawMeetingUrl ? { meetingUrl: rawMeetingUrl } : {}),
      ...(willInviteLead ? { inviteLeadByEmail: true, leadEmail } : {}),
      status: 'scheduled' as const,
      createdAt: now,
    };
    await apptRef.set(appointment);

    // Atomically log the dial outcome as 'booked' on the lead. Same
    // shape as POST /api/leads/[id]/dials so the dial-history UI
    // renders this entry like any other.
    const dialEntry = {
      at: now,
      outcome: 'booked' as const,
      notes: `Booked appointment ${scheduledAt.toDate().toLocaleString()}`,
    };
    await leadRef.update({
      dialLog: FieldValue.arrayUnion(dialEntry),
      lastDialAt: now,
      lastDialOutcome: 'booked',
    });

    // Best-effort mirror to Google Calendar. Failures never block the
    // appointment write — local Firestore is the source of truth.
    let googleEventId: string | null = null;
    let googleCalendarSyncError: string | null = null;
    let resolvedMeetingUrl: string | null = rawMeetingUrl || null;
    try {
      const callbackUrl = buildGoogleCallbackUrl(req.url, GOOGLE_CALENDAR_CALLBACK_PATH);
      const { accessToken, calendarId } = await resolveGoogleCalendarAccessToken(agentId, callbackUrl);

      const startDate = scheduledAt.toDate();
      const endDate = new Date(startDate.getTime() + durationMinutes * 60_000);
      const descLines: string[] = [];
      if (leadPhone) descLines.push(`Phone: ${leadPhone}`);
      if (notes) descLines.push(`Notes: ${notes}`);
      if (rawMeetingUrl) descLines.push(`Join: ${rawMeetingUrl}`);
      descLines.push(`Lead in AFL: ${origin}/dashboard/leads/${leadId}`);

      const event = await createCalendarEvent({
        accessToken,
        calendarId,
        event: {
          title: `${leadName || 'Lead'} — Mortgage Protection appointment`,
          description: descLines.join('\n'),
          startIso: startDate.toISOString(),
          endIso: endDate.toISOString(),
          timeZone: scheduledAtTimeZone || undefined,
          attendees: willInviteLead ? [{ email: leadEmail, displayName: leadName || undefined }] : undefined,
          addGoogleMeet,
        },
      });
      googleEventId = event.id;
      // If Google created a Meet link, prefer that as the canonical meetingUrl.
      if (addGoogleMeet && event.hangoutLink) {
        resolvedMeetingUrl = event.hangoutLink;
      }
      const apptUpdate: Record<string, unknown> = { googleEventId, googleCalendarSyncError: null };
      if (resolvedMeetingUrl && resolvedMeetingUrl !== rawMeetingUrl) {
        apptUpdate.meetingUrl = resolvedMeetingUrl;
      }
      await apptRef.update(apptUpdate);
    } catch (err) {
      if (err instanceof GoogleCalendarNotConnectedError) {
        // Not connected — silent skip; not a failure.
      } else {
        googleCalendarSyncError = err instanceof Error ? err.message : 'calendar_sync_failed';
        console.error('leads/appointments calendar mirror failed:', err);
        await apptRef.update({ googleCalendarSyncError }).catch(() => {});
      }
    }

    // Wake the agent's phone with a "tap to send confirmation" push.
    // Best-effort — failures here NEVER block the appointment response,
    // because the agent has the dashboard fallback (QR / resend) if
    // their phone misses the notification. Logged for telemetry only.
    //
    // Use `after()` (not bare `void ...promise`) so Vercel keeps the
    // serverless function alive long enough for the Expo push call to
    // complete after we've returned the response to the dashboard.
    // The bare void pattern got killed mid-flight on Vercel and the
    // push silently dropped. `after` is the supported way to defer
    // work past the response without blocking.
    after(async () => {
      try {
        const res = await pushAgentForConfirmation({
          db,
          agentId,
          apptId: apptRef.id,
          leadName,
          kind: 'confirmation',
        });
        if (res.outcome !== 'ok') {
          console.log('agent confirmation push skipped or failed:', {
            agentId,
            apptId: apptRef.id,
            outcome: res.outcome,
            reason: res.reason,
          });
        }
      } catch (err) {
        console.warn('agent confirmation push threw:', err);
      }
    });

    return NextResponse.json({
      appointmentId: apptRef.id,
      appointment: {
        id: apptRef.id,
        ...appointment,
        ...(resolvedMeetingUrl ? { meetingUrl: resolvedMeetingUrl } : {}),
        ...(googleEventId ? { googleEventId } : {}),
        ...(googleCalendarSyncError ? { googleCalendarSyncError } : {}),
      },
    });
  } catch (error) {
    console.error('leads/appointments POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
