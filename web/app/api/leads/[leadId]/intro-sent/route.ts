import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../../lib/firebase-admin';

/**
 * POST /api/leads/[leadId]/intro-sent
 *
 * Stamp that the agent fired off the "teed up" intro text to this lead.
 * The SMS itself goes out from the agent's own phone (Web Share / `sms:`
 * hand-off) — there's no OS callback, so like the booking confirmation we
 * stamp on intent. Sets `introTextSentAt` on the lead (drives the
 * "Intro sent ✓" state in the UI so the action quiets down) and drops an
 * entry on the agent's `leadActivity` feed.
 *
 * Auth: Bearer ID token; agentId comes from the authenticated user, never
 * the body. Agent must own the lead.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ leadId: string }> },
) {
  try {
    const { leadId } = await context.params;
    if (!leadId) {
      return NextResponse.json({ error: 'Missing leadId' }, { status: 400 });
    }

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

    const db = getAdminFirestore();
    const leadRef = db.collection('agents').doc(agentId).collection('leads').doc(leadId);
    const snap = await leadRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    await leadRef.set({ introTextSentAt: FieldValue.serverTimestamp() }, { merge: true });

    // Activity-feed entry (best-effort — never fail the stamp on this).
    try {
      const leadName = (snap.data()?.name as string | undefined)?.trim();
      await db
        .collection('agents')
        .doc(agentId)
        .collection('leadActivity')
        .add({
          leadId,
          kind: 'intro_text_sent',
          at: FieldValue.serverTimestamp(),
          summary: leadName ? `Sent intro text to ${leadName}` : 'Sent intro text to lead',
        });
    } catch (activityErr) {
      console.error('intro-sent activity write failed (non-fatal):', activityErr);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('leads/intro-sent error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
