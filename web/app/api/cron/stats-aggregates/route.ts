import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { computeAgentAggregates } from '../../../../lib/stats-aggregation';

/**
 * GET /api/cron/stats-aggregates
 *
 * Daily cron: computes aggregate metrics for each agent and writes
 * them to `agents/{agentId}/stats/aggregates`.
 *
 * Schedule: 0 6 * * * (6 AM UTC daily)
 */

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getAdminFirestore();
    const agentsSnap = await db.collection('agents').get();

    let agentsProcessed = 0;

    for (const agentDoc of agentsSnap.docs) {
      const agentId = agentDoc.id;
      const aggregates = await computeAgentAggregates(db, agentId);

      await db
        .collection('agents')
        .doc(agentId)
        .collection('stats')
        .doc('aggregates')
        .set(aggregates);

      agentsProcessed++;
    }

    return NextResponse.json({
      success: true,
      agentsProcessed,
    });
  } catch (error) {
    console.error('Stats aggregation cron error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
