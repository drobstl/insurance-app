import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { queueOrRefreshWelcomeActionItem } from '../../../../lib/welcome-action-item-writer';

/**
 * Bulk-import drip release cron — Mode 2 (May 9, 2026).
 *
 * SOURCE OF TRUTH: `CONTEXT.md` > `Channel Rules` > Bulk import +
 * `docs/AFL_Welcome_Flow_Amendment_2026-05-07.md` §4.2 (revised
 * May 9 — PWA + Web Push gate dropped, recipient-local timezone
 * windowing dropped, variants dropped — all per Daniel's call:
 * keep it simple, send from agent's personal phone is the
 * line-health discipline).
 *
 * Behavior:
 * - Daily, picks up to 15 clients per agent that have
 *   `bulkImportPendingDrip == true` (set by `/api/clients/import-batch`
 *   when the agent imports a CSV/PDF book of business).
 * - For each, queues a Mode 2 welcome action item via the existing
 *   welcome writer (cold-context copy variant — see
 *   `buildPhase1WelcomeBody` with `mode='mode_2'`).
 * - Clears the flag once released. Clients without a usable phone
 *   are marked with a skip reason and removed from the candidate
 *   pool so they don't block daily quota.
 *
 * Pacing rationale (15/day): protects the agent's PERSONAL phone
 * number from carrier spam-flag heuristics. The bulk-import drip
 * sends from the agent's personal device via `sms:` URLs (NOT the
 * Linq pooled line — Linq has confirmed bulk import cannot run
 * through their line under any circumstances). Carriers flag
 * personal numbers that suddenly send 50+ outbound texts in a day;
 * the 15/day cap keeps activity inside normal-human territory.
 */

const DAILY_RELEASE_LIMIT = 15;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getAdminFirestore();
    const nowIso = new Date().toISOString();

    let agentsScanned = 0;
    let totalReleased = 0;
    let totalSkippedNoPhone = 0;
    let totalSkippedAlreadyComplete = 0;
    const perAgent: Array<{
      agentId: string;
      released: number;
      skippedNoPhone: number;
      skippedAlreadyComplete: number;
      pendingAfter: number;
    }> = [];

    const agentsSnap = await db.collection('agents').get();

    for (const agentDoc of agentsSnap.docs) {
      agentsScanned++;
      const agentId = agentDoc.id;

      const candidatesSnap = await db
        .collection('agents')
        .doc(agentId)
        .collection('clients')
        .where('bulkImportPendingDrip', '==', true)
        .orderBy('createdAt', 'asc')
        .limit(DAILY_RELEASE_LIMIT)
        .get();

      if (candidatesSnap.empty) continue;

      let released = 0;
      let skippedNoPhone = 0;
      let skippedAlreadyComplete = 0;

      for (const clientDoc of candidatesSnap.docs) {
        const clientId = clientDoc.id;
        try {
          const result = await queueOrRefreshWelcomeActionItem({
            db,
            agentId,
            clientId,
            mode: 'mode_2',
          });

          const clearUpdate: Record<string, unknown> = {
            bulkImportPendingDrip: false,
            bulkImportReleasedAt: nowIso,
            bulkImportReleaseOutcome: result.outcome,
          };

          if (result.outcome === 'skipped_no_phone') {
            skippedNoPhone++;
            // Stays out of future passes — the flag is cleared and
            // the outcome marker explains why no welcome was queued.
          } else if (result.outcome === 'skipped_already_completed') {
            skippedAlreadyComplete++;
          } else {
            released++;
          }

          await clientDoc.ref.update(clearUpdate);
        } catch (err) {
          console.error('[bulk-import-drip] release failed for client (non-blocking)', {
            agentId,
            clientId,
            error: err instanceof Error ? err.message : String(err),
          });
          // Don't clear the flag — the client stays in the pool for
          // tomorrow's pass. This protects against transient
          // failures (network blip, transient Firestore error).
        }
      }

      // Get the post-release pending count so the dashboard surface
      // (and ops telemetry) can show "X of Y queued" if it ever
      // wants to.
      const remaining = await db
        .collection('agents')
        .doc(agentId)
        .collection('clients')
        .where('bulkImportPendingDrip', '==', true)
        .count()
        .get();

      const pendingAfter = remaining.data().count;

      perAgent.push({
        agentId,
        released,
        skippedNoPhone,
        skippedAlreadyComplete,
        pendingAfter,
      });

      totalReleased += released;
      totalSkippedNoPhone += skippedNoPhone;
      totalSkippedAlreadyComplete += skippedAlreadyComplete;

      console.log('[bulk-import-drip] agent batch released', {
        agentId,
        released,
        skippedNoPhone,
        skippedAlreadyComplete,
        pendingAfter,
      });
    }

    return NextResponse.json({
      success: true,
      agentsScanned,
      totalReleased,
      totalSkippedNoPhone,
      totalSkippedAlreadyComplete,
      perAgent,
    });
  } catch (error) {
    console.error('[bulk-import-drip] cron failed', error);
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 });
  }
}
