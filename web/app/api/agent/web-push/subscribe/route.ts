import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { getAdminAuth } from '../../../../../lib/firebase-admin';
import { registerAgentWebPushSubscription } from '../../../../../lib/web-push-lifecycle';

/**
 * POST /api/agent/web-push/subscribe
 *
 * Persists the agent's PushSubscription on their agent doc. Idempotent:
 * re-posting the same endpoint refreshes timestamps but does not
 * duplicate. The agent's PWA calls this on first permission grant AND
 * after any `pushsubscriptionchange` re-subscribe (handled in the
 * dashboard PWA installer client component).
 *
 * Body: { endpoint, keys: { p256dh, auth }, userAgent? }
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

    const body = (await req.json().catch(() => null)) as
      | {
          endpoint?: unknown;
          keys?: { p256dh?: unknown; auth?: unknown };
          userAgent?: unknown;
        }
      | null;
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
    const p256dh = typeof body?.keys?.p256dh === 'string' ? body.keys.p256dh : '';
    const auth = typeof body?.keys?.auth === 'string' ? body.keys.auth : '';
    const userAgent = typeof body?.userAgent === 'string' ? body.userAgent : null;

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { error: 'Missing endpoint, keys.p256dh, or keys.auth' },
        { status: 400 },
      );
    }

    const result = await registerAgentWebPushSubscription({
      agentId,
      subscription: { endpoint, keys: { p256dh, auth } },
      userAgent,
    });

    console.log('[web-push] subscription registered', {
      agentId,
      added: result.added,
      total: result.total,
      endpointSuffix: endpoint.length > 12 ? `***${endpoint.slice(-12)}` : '***',
    });

    return NextResponse.json({ success: true, added: result.added, total: result.total });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[web-push] subscribe failed', { error: errMsg });
    if (errMsg.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
