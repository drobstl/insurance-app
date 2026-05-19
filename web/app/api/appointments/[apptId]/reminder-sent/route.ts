import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../../lib/firebase-admin';

/**
 * POST /api/appointments/[apptId]/reminder-sent
 *
 * Mirrors the confirmation-sent endpoint (Chunk 4e) for the
 * day-of reminder send (Chunk 4f). Stamps `sentReminderAt` on the
 * appointment doc on the agent's intent to send.
 *
 * Idempotent — re-sends overwrite the timestamp; the latest send wins.
 */
export async function POST(
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
    const attachedBusinessCard = body?.attachedBusinessCard === true;
    const attachedLicenseState = typeof body?.attachedLicenseState === 'string'
      ? body.attachedLicenseState.trim().toUpperCase()
      : '';

    const db = getAdminFirestore();
    const apptRef = db.collection('agents').doc(agentId).collection('appointments').doc(apptId);
    const apptSnap = await apptRef.get();
    if (!apptSnap.exists) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }
    await apptRef.update({ sentReminderAt: FieldValue.serverTimestamp() });

    // Stamp lead.attachmentsSent so subsequent sends skip files
    // already on the lead's phone. Same logic as confirmation-sent.
    const leadId = apptSnap.data()?.leadId;
    if (typeof leadId === 'string' && (attachedBusinessCard || attachedLicenseState)) {
      const leadRef = db.collection('agents').doc(agentId).collection('leads').doc(leadId);
      const leadUpdates: Record<string, unknown> = {};
      const nowIso = new Date().toISOString();
      if (attachedBusinessCard) {
        leadUpdates['attachmentsSent.businessCardAt'] = nowIso;
      }
      if (attachedLicenseState) {
        leadUpdates[`attachmentsSent.licensesByState.${attachedLicenseState}`] = nowIso;
      }
      await leadRef.update(leadUpdates).catch((err) => {
        console.warn('lead attachmentsSent update failed:', err);
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('reminder-sent error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
