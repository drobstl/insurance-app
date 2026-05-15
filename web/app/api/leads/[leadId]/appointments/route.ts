import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../../lib/firebase-admin';
import { DEFAULT_DURATION_MINUTES, isValidIsoTimestamp } from '../../../../../lib/appointments';

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

    // Create appointment doc.
    const apptRef = db.collection('agents').doc(agentId).collection('appointments').doc();
    const appointment = {
      leadId,
      leadName,
      leadPhone,
      leadState,
      scheduledAt,
      durationMinutes,
      ...(notes ? { notes } : {}),
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

    return NextResponse.json({
      appointmentId: apptRef.id,
      appointment: { id: apptRef.id, ...appointment },
    });
  } catch (error) {
    console.error('leads/appointments POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
