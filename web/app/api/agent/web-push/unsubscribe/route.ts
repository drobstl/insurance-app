import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { getAdminAuth } from '../../../../../lib/firebase-admin';
import { removeAgentWebPushSubscription } from '../../../../../lib/web-push-lifecycle';

/**
 * POST /api/agent/web-push/unsubscribe
 *
 * Removes a single subscription endpoint from the agent doc. Called
 * when the agent revokes notification permission OR when the dashboard
 * detects that `pushManager.getSubscription()` returned null after a
 * prior subscribe (browser-side state out of sync).
 *
 * If this was the last subscription, `webPushPermissionRevokedAt` is
 * set on the agent doc so the onboarding flow knows the agent must
 * re-grant the Web Push milestone (Phase 1 hard onboarding gate).
 *
 * Body: { endpoint }
 * Auth: Bearer <Firebase ID token>
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = await getAdminAuth().verifyIdToken(token);
    const agentId = decoded.uid;

    const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
    if (!endpoint) {
      return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
    }

    const result = await removeAgentWebPushSubscription({
      agentId,
      endpoint,
      reason: 'agent_unsubscribed',
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[web-push] unsubscribe failed', { error: errMsg });
    if (errMsg.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
