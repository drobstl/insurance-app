import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { releaseDripForAgent } from '../../../../lib/bulk-import-drip';

/**
 * Bulk-import drip release cron — Mode 2 (May 9, 2026; refactored May 12).
 *
 * SOURCE OF TRUTH: `CONTEXT.md` > `Channel Rules` > Bulk import +
 * `docs/AFL_Welcome_Flow_Amendment_2026-05-07.md` §4.2 (revised
 * May 9 — PWA + Web Push gate dropped, recipient-local timezone
 * windowing dropped, variants dropped — all per Daniel's call:
 * keep it simple, send from agent's personal phone is the
 * line-health discipline).
 *
 * Per-agent release logic lives in `web/lib/bulk-import-drip.ts` so
 * the same path is used both here (daily 1 PM UTC cron) and by
 * `/api/clients/import-batch` (fires immediately after activate so
 * the first 15 hit the agent's queue without waiting overnight).
 * The 15/day UTC cap is enforced inside the helper — concurrent
 * cron + immediate release on the same UTC day can't double-up.
 */

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getAdminFirestore();

    let agentsScanned = 0;
    let totalReleased = 0;
    let totalSkippedNoPhone = 0;
    let totalSkippedAlreadyComplete = 0;
    let totalSameDayCapReached = 0;
    const perAgent: Array<{
      agentId: string;
      released: number;
      skippedNoPhone: number;
      skippedAlreadyComplete: number;
      pendingAfter: number;
      sameDayCapReached: boolean;
    }> = [];

    const agentsSnap = await db.collection('agents').get();

    for (const agentDoc of agentsSnap.docs) {
      agentsScanned++;
      const agentId = agentDoc.id;

      const outcome = await releaseDripForAgent({ db, agentId });

      if (
        outcome.released === 0 &&
        outcome.skippedNoPhone === 0 &&
        outcome.skippedAlreadyComplete === 0 &&
        !outcome.sameDayCapReached
      ) {
        // No pending candidates for this agent — skip telemetry noise.
        continue;
      }

      perAgent.push({
        agentId,
        released: outcome.released,
        skippedNoPhone: outcome.skippedNoPhone,
        skippedAlreadyComplete: outcome.skippedAlreadyComplete,
        pendingAfter: outcome.pendingAfter,
        sameDayCapReached: outcome.sameDayCapReached,
      });

      totalReleased += outcome.released;
      totalSkippedNoPhone += outcome.skippedNoPhone;
      totalSkippedAlreadyComplete += outcome.skippedAlreadyComplete;
      if (outcome.sameDayCapReached) totalSameDayCapReached++;

      console.log('[bulk-import-drip] agent batch released', {
        agentId,
        released: outcome.released,
        skippedNoPhone: outcome.skippedNoPhone,
        skippedAlreadyComplete: outcome.skippedAlreadyComplete,
        pendingAfter: outcome.pendingAfter,
        sameDayCapReached: outcome.sameDayCapReached,
      });
    }

    return NextResponse.json({
      success: true,
      agentsScanned,
      totalReleased,
      totalSkippedNoPhone,
      totalSkippedAlreadyComplete,
      totalSameDayCapReached,
      perAgent,
    });
  } catch (error) {
    console.error('[bulk-import-drip] cron failed', error);
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 });
  }
}
