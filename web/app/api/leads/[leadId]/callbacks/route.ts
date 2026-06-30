import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../../lib/firebase-admin';
import { isValidIsoTimestamp } from '../../../../../lib/appointments';

/**
 * POST /api/leads/[leadId]/callbacks
 *
 * Record a lead-requested call-back at a COMMITTED time. Distinct from a
 * booked appointment: the lead asked to be called back, they didn't agree to
 * a sit. We:
 *   1. Write a `kind: 'callback'` doc into the SAME
 *      `agents/{agentId}/appointments/{id}` collection — so the calendar
 *      week-view query renders it for free — but tagged so EVERY booking/show
 *      metric skips it (see isCallback + activity-stats). It carries no
 *      duration/meeting/Google fields and never enters the sit_* outcome flow.
 *   2. Set the lead's `followUpAt` to that EXACT time, so the dial queue
 *      resurfaces the lead right when the call-back is due (manual follow-ups
 *      use 9am; a callback uses the committed clock time).
 *   3. Atomically append a `callback_requested` dial outcome — same shape as
 *      POST /api/leads/[id]/dials, so dial history renders it like any dial.
 *
 * When the lead gives NO time, the client posts to /dials instead (that path
 * bumps followUpAt to the next day and writes no calendar entry).
 *
 * Body: { scheduledAt: ISO string, scheduledAtTimeZone?: string,
 *         notes?: string, phoneDialed?: string }
 * Auth: Bearer ID token; agent owns the lead.
 */

// Nominal block length so the callback renders as a visible slot on the
// calendar. A callback is a point in time, not a meeting — this is display
// only and is never read by any duration/show metric.
const CALLBACK_BLOCK_MINUTES = 15;

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
    const scheduledAtTimeZone = typeof body?.scheduledAtTimeZone === 'string'
      ? body.scheduledAtTimeZone.trim().slice(0, 80)
      : '';
    const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 500) : '';
    const phoneDialed = typeof body?.phoneDialed === 'string' ? body.phoneDialed.trim().slice(0, 40) : '';

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
    const leadState = (leadData.address && typeof leadData.address === 'object'
      && typeof (leadData.address as Record<string, unknown>).state === 'string')
      ? (leadData.address as Record<string, string>).state
      : null;

    const scheduledAt = Timestamp.fromDate(new Date(scheduledAtIso));
    const now = Timestamp.now();

    // Callback entry — same collection as appointments, tagged so it never
    // counts as one.
    const apptRef = db.collection('agents').doc(agentId).collection('appointments').doc();
    const callback = {
      kind: 'callback' as const,
      leadId,
      leadName,
      leadPhone,
      leadState,
      scheduledAt,
      ...(scheduledAtTimeZone ? { scheduledAtTimeZone } : {}),
      durationMinutes: CALLBACK_BLOCK_MINUTES,
      ...(notes ? { notes } : {}),
      status: 'scheduled' as const,
      createdAt: now,
    };
    await apptRef.set(callback);

    // Atomically log the dial outcome + resurface the lead in the queue at the
    // committed time (exact clock time, not 9am).
    const dialEntry = {
      at: now,
      outcome: 'callback_requested' as const,
      notes: `Callback set for ${scheduledAt.toDate().toLocaleString()}`,
      ...(phoneDialed ? { phoneDialed } : {}),
    };
    await leadRef.update({
      dialLog: FieldValue.arrayUnion(dialEntry),
      lastDialAt: now,
      lastDialOutcome: 'callback_requested',
      followUpAt: scheduledAt,
    });

    return NextResponse.json({
      callbackId: apptRef.id,
      callback: { id: apptRef.id, ...callback },
    });
  } catch (error) {
    console.error('leads/callbacks POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
