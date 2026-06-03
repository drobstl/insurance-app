import 'server-only';

import { NextRequest, NextResponse, after } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { VALID_STATUSES, isValidIsoTimestamp, type AppointmentStatus } from '../../../../lib/appointments';
import {
  deleteCalendarEvent,
  GoogleCalendarNotConnectedError,
  patchCalendarEvent,
  resolveGoogleCalendarAccessToken,
} from '../../../../lib/google-calendar';
import { buildGoogleCallbackUrl, GOOGLE_CALENDAR_CALLBACK_PATH } from '../../../../lib/oauth-redirect';
import { pushAgentForConfirmation } from '../../../../lib/agent-push';

/**
 * PATCH /api/appointments/[apptId]
 *
 * Update an appointment — reschedule (scheduledAt / durationMinutes),
 * change status (cancelled / completed / no_show), or edit notes.
 *
 * Lives at /api/appointments/[apptId] (NOT /api/leads/[leadId]/...)
 * because appointments are stored at agents/{agentId}/appointments
 * directly — not nested under the lead. The leadId is just a
 * back-reference field on the appointment doc.
 *
 * Body (all optional, at least one required):
 *   - scheduledAt: ISO string
 *   - durationMinutes: number
 *   - status: 'scheduled' | 'completed' | 'cancelled' | 'no_show'
 *   - notes: string
 *
 * Auth: Bearer ID token; agent owns the appointment.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ apptId: string }> },
) {
  try {
    const { apptId } = await context.params;
    if (!apptId) return NextResponse.json({ error: 'Missing apptId' }, { status: 400 });

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
    const updates: Record<string, unknown> = {};

    if (body?.scheduledAt !== undefined) {
      const iso = String(body.scheduledAt).trim();
      if (!isValidIsoTimestamp(iso)) {
        return NextResponse.json({ error: 'scheduledAt must be ISO' }, { status: 400 });
      }
      updates.scheduledAt = Timestamp.fromDate(new Date(iso));
    }
    if (body?.durationMinutes !== undefined) {
      const n = Math.round(Number(body.durationMinutes));
      if (Number.isNaN(n) || n < 5 || n > 480) {
        return NextResponse.json({ error: 'durationMinutes out of range (5–480)' }, { status: 400 });
      }
      updates.durationMinutes = n;
    }
    if (body?.status !== undefined) {
      const s = String(body.status);
      if (!VALID_STATUSES.includes(s as AppointmentStatus)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      updates.status = s;
    }
    if (body?.notes !== undefined) {
      updates.notes = String(body.notes).slice(0, 1000);
    }
    if (body?.scheduledAtTimeZone !== undefined) {
      const tz = String(body.scheduledAtTimeZone).trim().slice(0, 80);
      updates.scheduledAtTimeZone = tz || null;
    }
    if (body?.meetingUrl !== undefined) {
      const url = String(body.meetingUrl).trim().slice(0, 500);
      updates.meetingUrl = url || null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const ref = db.collection('agents').doc(agentId).collection('appointments').doc(apptId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }
    const prior = snap.data() ?? {};
    await ref.update(updates);

    // Best-effort mirror to Google Calendar. Never fail the PATCH.
    const priorEventId = typeof prior.googleEventId === 'string' ? prior.googleEventId : null;
    if (priorEventId) {
      try {
        const callbackUrl = buildGoogleCallbackUrl(req.url, GOOGLE_CALENDAR_CALLBACK_PATH);
        const { accessToken, calendarId } = await resolveGoogleCalendarAccessToken(agentId, callbackUrl);

        const nextStatus = (updates.status as AppointmentStatus | undefined) ?? (prior.status as AppointmentStatus | undefined);
        if (nextStatus === 'cancelled') {
          await deleteCalendarEvent({ accessToken, calendarId, eventId: priorEventId });
          await ref.update({ googleEventId: null, googleCalendarSyncError: null });
        } else {
          const patch: { startIso?: string; endIso?: string; description?: string; timeZone?: string } = {};
          const startTs = (updates.scheduledAt as Timestamp | undefined) ?? (prior.scheduledAt as Timestamp | undefined);
          const durationMinutes = (updates.durationMinutes as number | undefined) ?? (prior.durationMinutes as number | undefined);
          const tz = (updates.scheduledAtTimeZone as string | null | undefined) !== undefined
            ? (updates.scheduledAtTimeZone as string | null | undefined) || undefined
            : (typeof prior.scheduledAtTimeZone === 'string' ? prior.scheduledAtTimeZone : undefined);
          if (tz) patch.timeZone = tz;
          if (updates.scheduledAt !== undefined || updates.durationMinutes !== undefined) {
            if (startTs && typeof durationMinutes === 'number') {
              const startDate = startTs.toDate();
              const endDate = new Date(startDate.getTime() + durationMinutes * 60_000);
              patch.startIso = startDate.toISOString();
              patch.endIso = endDate.toISOString();
            }
          }
          if (updates.notes !== undefined || updates.meetingUrl !== undefined) {
            const leadPhone = typeof prior.leadPhone === 'string' ? prior.leadPhone : '';
            const leadId = typeof prior.leadId === 'string' ? prior.leadId : '';
            const notesStr = updates.notes !== undefined
              ? String(updates.notes)
              : (typeof prior.notes === 'string' ? prior.notes : '');
            const meetingUrl = updates.meetingUrl !== undefined
              ? (updates.meetingUrl as string | null) || ''
              : (typeof prior.meetingUrl === 'string' ? prior.meetingUrl : '');
            const lines: string[] = [];
            if (leadPhone) lines.push(`Phone: ${leadPhone}`);
            if (notesStr) lines.push(`Notes: ${notesStr}`);
            if (meetingUrl) lines.push(`Join: ${meetingUrl}`);
            if (leadId) lines.push(`Lead in AFL: ${origin}/dashboard/leads/${leadId}`);
            patch.description = lines.join('\n');
          }
          if (patch.startIso || patch.endIso || patch.description !== undefined) {
            await patchCalendarEvent({
              accessToken,
              calendarId,
              eventId: priorEventId,
              event: patch,
            });
            await ref.update({ googleCalendarSyncError: null });
          }
        }
      } catch (err) {
        if (err instanceof GoogleCalendarNotConnectedError) {
          // Not connected — silent skip.
        } else {
          const message = err instanceof Error ? err.message : 'calendar_sync_failed';
          console.error('appointments PATCH calendar mirror failed:', err);
          await ref.update({ googleCalendarSyncError: message }).catch(() => {});
        }
      }
    }

    // Reschedule trigger: if the scheduled time actually changed, fire
    // a fresh "send updated confirmation" push to the agent. Other
    // edits (notes, status changes) don't trigger this — the lead
    // doesn't need to hear from the agent every time a note is added.
    //
    // Uses `after()` so Vercel keeps the serverless function alive past
    // the response long enough for the Expo push call to complete.
    // The bare void-promise pattern silently dropped pushes mid-flight.
    if (updates.scheduledAt !== undefined) {
      const newTs = updates.scheduledAt as Timestamp;
      const priorTs = prior.scheduledAt as Timestamp | undefined;
      const timeActuallyChanged =
        !priorTs || newTs.toMillis() !== priorTs.toMillis();
      if (timeActuallyChanged) {
        const leadName = typeof prior.leadName === 'string' ? prior.leadName : '';
        after(async () => {
          try {
            const res = await pushAgentForConfirmation({
              db,
              agentId,
              apptId,
              leadName,
              kind: 'confirmation',
            });
            if (res.outcome !== 'ok') {
              console.log('agent reschedule push skipped or failed:', {
                agentId,
                apptId,
                outcome: res.outcome,
                reason: res.reason,
              });
            }
          } catch (err) {
            console.warn('agent reschedule push threw:', err);
          }
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('appointments PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/appointments/[apptId]
 *
 * Hard delete. Use sparingly — prefer PATCH status='cancelled' to
 * preserve history. Useful for cleanup during testing.
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ apptId: string }> },
) {
  try {
    const { apptId } = await context.params;
    if (!apptId) return NextResponse.json({ error: 'Missing apptId' }, { status: 400 });

    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    let decoded;
    try {
      decoded = await getAdminAuth().verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const db = getAdminFirestore();
    const ref = db
      .collection('agents')
      .doc(decoded.uid)
      .collection('appointments')
      .doc(apptId);

    // Read before deleting so we can clean up the mirrored Google event.
    const snap = await ref.get();
    const priorEventId = snap.exists && typeof snap.data()?.googleEventId === 'string'
      ? (snap.data()!.googleEventId as string)
      : null;

    if (priorEventId) {
      try {
        const callbackUrl = buildGoogleCallbackUrl(req.url, GOOGLE_CALENDAR_CALLBACK_PATH);
        const { accessToken, calendarId } = await resolveGoogleCalendarAccessToken(decoded.uid, callbackUrl);
        await deleteCalendarEvent({ accessToken, calendarId, eventId: priorEventId });
      } catch (err) {
        if (!(err instanceof GoogleCalendarNotConnectedError)) {
          // Log but don't block the Firestore delete — leftover Google event is
          // recoverable; failing the request leaves a phantom local appointment.
          console.error('appointments DELETE calendar mirror failed:', err);
        }
      }
    }

    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('appointments DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
