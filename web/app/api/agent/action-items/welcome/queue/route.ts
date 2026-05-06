import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { getAdminAuth, getAdminFirestore } from '../../../../../../lib/firebase-admin';
import { sendAgentWebPush } from '../../../../../../lib/web-push-lifecycle';
import { queueOrRefreshWelcomeActionItem } from '../../../../../../lib/welcome-action-item-writer';

/**
 * POST /api/agent/action-items/welcome/queue
 *
 * Queues a welcome action item, OR refreshes the displayContext of the
 * existing pending item in place when called again for the same client
 * (idempotent on `welcome:{clientId}`).
 *
 * Locked Phase 1 trigger contract (Daniel, May 5, 2026):
 *   "A welcome action item is queued at the moment the agent confirms PDF
 *    extraction and creates the client profile.... If the agent edits the
 *    client profile after creation in a way that changes name or code,
 *    the welcome action item updates in place (it does not duplicate or
 *    regenerate)."
 *
 * Two callers from the dashboard:
 * - `handleManualCreateAndContinue` / `handleReviewConfirmAndCreate` in
 *   `web/app/dashboard/clients/page.tsx`, immediately after
 *   `createClientFromAddFlow` resolves.
 * - `handleInlineUpdateClient` (same file), so a name/code edit on an
 *   already-queued client refreshes the action item in place.
 *
 * Body: { clientId }
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

    const body = (await req.json().catch(() => null)) as { clientId?: unknown } | null;
    const clientId = typeof body?.clientId === 'string' ? body.clientId.trim() : '';
    if (!clientId) {
      return NextResponse.json({ error: 'Missing clientId' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const result = await queueOrRefreshWelcomeActionItem({ db, agentId, clientId });

    console.log('[welcome-action-item] queue', {
      agentId,
      clientId,
      itemId: result.itemId,
      outcome: result.outcome,
      created: result.result?.created ?? false,
    });

    // Phase 1 Track B: notify the agent on their installed PWA the
    // moment a NEW welcome action item lands. Refreshes (in-place
    // edits) and skips do not re-notify — that would be a noise wall
    // every time the agent edits a client. Fire-and-forget; the cron /
    // dashboard surface remain the canonical interaction paths.
    if (result.outcome === 'created') {
      const subjectName = result.result?.doc.displayContext.subjectFirstName
        || result.result?.doc.displayContext.subjectName
        || 'a new client';
      void sendAgentWebPush({
        agentId,
        payload: {
          title: 'New welcome to send',
          body: `${subjectName} is ready for their welcome text — open AFL on your phone to send.`,
          tag: `welcome-${clientId}`,
          url: '/dashboard?welcome=' + encodeURIComponent(clientId),
          data: {
            kind: 'welcome_action_item_created',
            clientId,
            actionItemId: result.itemId,
          },
          requireInteraction: false,
        },
      }).catch((err) => {
        console.error('[welcome-action-item] web-push notify failed (non-blocking)', {
          agentId,
          clientId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    return NextResponse.json({
      success: true,
      itemId: result.itemId,
      outcome: result.outcome,
      created: result.result?.created ?? false,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[welcome-action-item] queue failed', { error: errMsg });
    if (errMsg.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (errMsg.startsWith('client ')) {
      return NextResponse.json({ error: errMsg }, { status: 404 });
    }
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
