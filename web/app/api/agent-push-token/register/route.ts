import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import {
  PUSH_PERMISSION_REVOKED_FIELD,
  PHONE_RECONNECT_ALERT_FIELD,
} from '../../../../lib/push-permission-lifecycle';

/**
 * POST /api/agent-push-token/register
 *
 * The AFL mobile app calls this from /agent-home after the agent
 * pairs and push permission is granted. We save the Expo push token
 * on the agent doc so server-side triggers (booking, reschedule,
 * 1-hour reminder) can push the agent.
 *
 * Auth: standard Bearer Firebase ID token (the agent is signed in
 * after `signInWithCustomToken` completes during the pair flow).
 *
 * Idempotent. Re-registering the same token overwrites cleanly. We
 * also clear `pushPermissionRevokedAt` because a successful registration
 * means the agent re-enabled push (or just freshly enabled it).
 */
export async function POST(req: NextRequest) {
  try {
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

    const body = await req.json().catch(() => ({}));
    const pushToken = typeof body?.pushToken === 'string' ? body.pushToken.trim() : '';
    if (!pushToken) {
      return NextResponse.json({ error: 'Missing pushToken' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const agentRef = db.collection('agents').doc(agentId);
    const agentSnap = await agentRef.get();
    if (!agentSnap.exists) {
      return NextResponse.json({ error: 'Agent profile not found' }, { status: 404 });
    }

    await agentRef.update({
      pushToken,
      pushTokenUpdatedAt: FieldValue.serverTimestamp(),
      [PUSH_PERMISSION_REVOKED_FIELD]: FieldValue.delete(),
      // A fresh pairing means any prior "reconnect your phone" alert is
      // resolved — clear the once-guard so a future drop re-alerts.
      [PHONE_RECONNECT_ALERT_FIELD]: FieldValue.delete(),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('agent-push-token/register error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
