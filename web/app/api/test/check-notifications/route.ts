import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';

/**
 * TEST-ONLY: Check what notifications exist for a client and whether
 * the mobile app's query would find them.
 *
 * Usage: GET /api/test/check-notifications?agentId=XXX&clientId=YYY
 *
 * ⚠️  Remove before production.
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get('agentId');
  const clientId = searchParams.get('clientId');

  if (!agentId || !clientId) {
    return NextResponse.json(
      { error: 'Missing required query params: agentId, clientId' },
      { status: 400 },
    );
  }

  const db = getAdminFirestore();

  // Query 1: All notifications (no filter)
  const allSnap = await db
    .collection('agents')
    .doc(agentId)
    .collection('clients')
    .doc(clientId)
    .collection('notifications')
    .get();

  // Query 2: Same query the mobile app uses
  let unreadSnap;
  let queryError = null;
  try {
    unreadSnap = await db
      .collection('agents')
      .doc(agentId)
      .collection('clients')
      .doc(clientId)
      .collection('notifications')
      .where('readAt', '==', null)
      .orderBy('sentAt', 'desc')
      .limit(10)
      .get();
  } catch (err: unknown) {
    queryError = err instanceof Error ? err.message : String(err);
  }

  const allNotifs = allSnap.docs.map((d) => ({
    id: d.id,
    type: d.data().type,
    readAt: d.data().readAt,
    sentAt: d.data().sentAt?.toDate?.()?.toISOString() ?? null,
  }));

  return NextResponse.json({
    totalNotifications: allSnap.size,
    allNotifications: allNotifs,
    unreadQueryResult: queryError
      ? { error: queryError }
      : { count: unreadSnap?.size ?? 0 },
  });
}
