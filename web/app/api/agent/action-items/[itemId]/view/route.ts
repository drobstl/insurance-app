import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { markActionItemViewed } from '../../../../../../lib/action-item-store';
import { getAdminAuth, getAdminFirestore } from '../../../../../../lib/firebase-admin';

/**
 * POST /api/agent/action-items/{itemId}/view
 *
 * Marks a pending action item as viewed by the agent. Increments
 * viewCount, stamps firstViewedAt once, refreshes lastViewedAt.
 *
 * Idempotent — repeated calls just increment the counter; safe to call
 * from `useEffect` on the action item card mount.
 *
 * Telemetry (`action_item_viewed`) is fired client-side from the
 * dashboard so PostHog identity context lives in the request lifecycle,
 * not here. This route only does the Firestore write.
 *
 * Auth: Bearer <Firebase ID token>
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
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
    const { itemId } = await params;
    if (!itemId) {
      return NextResponse.json({ error: 'Missing itemId' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const { viewed } = await markActionItemViewed({ db, agentId, itemId });

    return NextResponse.json({ success: true, viewed });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[welcome-action-item] view failed', { error: errMsg });
    if (errMsg.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
