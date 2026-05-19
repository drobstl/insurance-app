import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../../lib/firebase-admin';

/**
 * POST /api/appointments/[apptId]/confirmation-sent
 *
 * Stamps `sentConfirmationAt` on the appointment doc. Idempotent —
 * subsequent calls overwrite the timestamp (the agent might re-send
 * if the lead doesn't reply; the latest send wins).
 *
 * Body (optional): `{ attachedBusinessCard?: boolean,
 * attachedLicenseState?: string }`. When the drawer reports what was
 * actually included in the share payload, this endpoint also stamps
 * `lead.attachmentsSent.businessCardAt` and
 * `lead.attachmentsSent.licensesByState[state]` so subsequent sends
 * to the same lead don't re-attach files the lead already has.
 *
 * The agent fires this after the Web Share API / `sms:` deep link
 * resolves on the client. We can't actually verify the message went
 * out (the OS doesn't surface that); we stamp on the agent's intent
 * to send. Good enough — agents managing their own ritual won't
 * cheat-stamp without sending.
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
    await apptRef.update({ sentConfirmationAt: FieldValue.serverTimestamp() });

    // If the drawer reported attaching files, stamp the lead's
    // attachmentsSent record so future sends to this lead skip them.
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
      // Best-effort — don't fail the user-visible stamp if this errors.
      await leadRef.update(leadUpdates).catch((err) => {
        console.warn('lead attachmentsSent update failed:', err);
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('confirmation-sent error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
