import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import {
  getPushPermissionStatus,
  readValidPushToken,
  sendExpoPush,
} from '../../../../lib/push-permission-lifecycle';

/**
 * POST /api/agent-push-token/test
 *
 * Sends a "test buzz" push to the AGENT'S OWN phone so they can confirm,
 * on demand, that pairing actually reaches their device.
 *
 * Why this exists: the dashboard's "Your phone is paired" indicator only
 * means we hold a push token that nothing has told us is dead. That can
 * drift from "the phone actually buzzes" — a token goes stale (Expo
 * reports `DeviceNotRegistered` on the *receipt*, which we don't fetch),
 * or a second device overwrote the single stored token. A real
 * round-trip push is the only honest check: the agent's phone buzzing
 * (or not) is the receipt.
 *
 * Routing through `sendExpoPush` means a `DeviceNotRegistered` *ticket*
 * still atomically clears the dead token + stamps
 * `pushPermissionRevokedAt`, so a failed test also flips the dashboard's
 * "paired" light off live and routes the agent to re-pair.
 *
 * Auth: standard Bearer Firebase ID token (the signed-in agent).
 *
 * Returns 200 with one of:
 *   { outcome: 'sent' }                       — Expo accepted the push
 *   { outcome: 'no_token', status }           — no usable token (never paired / revoked)
 *   { outcome: 'failed', tokenInvalidated }   — Expo rejected the send
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

    const db = getAdminFirestore();
    const agentRef = db.collection('agents').doc(agentId);
    const agentSnap = await agentRef.get();
    if (!agentSnap.exists) {
      return NextResponse.json({ error: 'Agent profile not found' }, { status: 404 });
    }
    const agentData = agentSnap.data() || {};

    // Same eligibility gate the real triggers use — token present AND not
    // revoked. If there's nothing usable, say so without calling Expo.
    const pushToken = readValidPushToken(agentData);
    if (!pushToken) {
      return NextResponse.json({
        outcome: 'no_token',
        status: getPushPermissionStatus(agentData),
      });
    }

    const outcome = await sendExpoPush(
      {
        to: pushToken,
        title: 'AgentForLife',
        body: "👋 You're connected — your phone will buzz when a lead books.",
        sound: 'default',
        priority: 'high',
        data: { type: 'pairing-test' },
      },
      { ref: agentRef, agentId },
    );

    if (outcome.status === 'ok') {
      return NextResponse.json({ outcome: 'sent' });
    }
    return NextResponse.json({
      outcome: 'failed',
      tokenInvalidated: outcome.status === 'token_invalidated',
    });
  } catch (error) {
    console.error('agent-push-token/test error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
