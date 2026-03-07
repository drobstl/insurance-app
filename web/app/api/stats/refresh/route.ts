import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { computeAgentAggregates } from '../../../../lib/stats-aggregation';

/**
 * POST /api/stats/refresh
 *
 * Authenticated endpoint: computes and writes aggregates for the current
 * agent, then returns them. Used by the admin Stats page "Refresh Now" button.
 *
 * Auth: Bearer <Firebase ID token>
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decoded = await getAdminAuth().verifyIdToken(token);
    const agentId = decoded.uid;

    const db = getAdminFirestore();
    const aggregates = await computeAgentAggregates(db, agentId);

    await db
      .collection('agents')
      .doc(agentId)
      .collection('stats')
      .doc('aggregates')
      .set(aggregates);

    return NextResponse.json({ success: true, aggregates });
  } catch (error) {
    console.error('Stats refresh error:', error);

    if (error instanceof Error && error.message.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: 'Failed to refresh stats' },
      { status: 500 },
    );
  }
}
