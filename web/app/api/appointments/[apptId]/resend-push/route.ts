import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../../lib/firebase-admin';
import { pushAgentForConfirmation } from '../../../../../lib/agent-push';

/**
 * POST /api/appointments/[apptId]/resend-push
 *
 * Fallback for "I didn't get the push." Re-fires the agent-targeted
 * confirmation notification for an existing appointment. Useful when:
 *   - The agent's phone was off or out of signal when the original push
 *     fired (APNs / FCM is best-effort delivery, no retries beyond a
 *     short window).
 *   - The agent dismissed the notification by mistake.
 *   - The agent wants to re-send a confirmation that was already sent
 *     (lead asked for it again).
 *
 * Body (optional): `{ kind?: 'confirmation' | 'reminder' }`. Defaults
 * to 'confirmation'.
 *
 * Auth: Bearer Firebase ID token. The appointment must belong to the
 * calling agent.
 *
 * The response carries the push outcome so the dashboard can show a
 * sensible message ("sent to your phone", "you haven't paired yet",
 * "notifications are off on that device", etc.) instead of a generic
 * success toast.
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
    const kind: 'confirmation' | 'reminder' =
      body?.kind === 'reminder' ? 'reminder' : 'confirmation';

    const db = getAdminFirestore();
    const apptRef = db
      .collection('agents').doc(agentId)
      .collection('appointments').doc(apptId);
    const apptSnap = await apptRef.get();
    if (!apptSnap.exists) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }
    const leadName = typeof apptSnap.data()?.leadName === 'string' ? apptSnap.data()!.leadName : '';

    const result = await pushAgentForConfirmation({
      db,
      agentId,
      apptId,
      leadName,
      kind,
    });

    return NextResponse.json({ outcome: result.outcome, reason: result.reason || null });
  } catch (error) {
    console.error('resend-push error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
