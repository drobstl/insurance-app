import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { VALID_STATUSES, isValidIsoTimestamp, type AppointmentStatus } from '../../../../lib/appointments';

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

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const ref = db.collection('agents').doc(agentId).collection('appointments').doc(apptId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }
    await ref.update(updates);
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
    await db
      .collection('agents')
      .doc(decoded.uid)
      .collection('appointments')
      .doc(apptId)
      .delete();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('appointments DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
