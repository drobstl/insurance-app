import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';

/**
 * DELETE /api/leads/[leadId]
 *
 * Delete a lead doc + its `leadCodes` index entry + any `leadActivity`
 * entries pointing at it. Auth: Bearer ID token, agent must own the lead
 * (the leadId is namespaced under their uid in Firestore so attempts to
 * delete someone else's lead naturally 404 here).
 *
 * If a mobile session is active for the deleted lead's code, the next
 * lookup will 404 and the existing mobile InvalidCodeError handling
 * clears the session and routes the user back to /activate. No additional
 * cleanup needed mobile-side.
 */
export async function DELETE(
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
    if (!token) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }
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
    const data = snap.data() ?? {};
    const leadCode = typeof data.leadCode === 'string' ? data.leadCode : '';

    // Delete in parallel: lead doc + index entry + any leadActivity entries
    // for this lead. Activity-entry cleanup uses a query because there's no
    // composite index needed (we filter by leadId on the agent's own
    // subcollection, which is small per-agent).
    const activitySnap = await db
      .collection('agents')
      .doc(agentId)
      .collection('leadActivity')
      .where('leadId', '==', leadId)
      .get();

    const ops: Promise<unknown>[] = [leadRef.delete()];
    if (leadCode) {
      ops.push(db.collection('leadCodes').doc(leadCode).delete().catch(() => {}));
    }
    activitySnap.docs.forEach((d) => {
      ops.push(d.ref.delete().catch(() => {}));
    });
    await Promise.all(ops);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('leads/delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
