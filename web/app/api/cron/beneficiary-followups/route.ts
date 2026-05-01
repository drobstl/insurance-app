import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getAdminFirestore();
    const nowIso = new Date().toISOString();

    let skipped = 0;

    const agentsSnap = await db.collection('agents').get();
    for (const agentDoc of agentsSnap.docs) {
      const queuedSnap = await db
        .collection('agents')
        .doc(agentDoc.id)
        .collection('beneficiaryFollowups')
        .where('status', '==', 'queued')
        .get();

      for (const followupDoc of queuedSnap.docs) {
        await followupDoc.ref.set(
          {
            status: 'skipped',
            reason: 'followups_disabled',
            processedAt: nowIso,
          },
          { merge: true },
        );
        skipped += 1;
      }
    }

    console.log('[beneficiary-followups] disabled', { skipped });
    return NextResponse.json({ success: true, disabled: true, skipped });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
