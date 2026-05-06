import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { expireOverdueActionItemsForAgent } from '../../../../lib/action-item-store';
import type { ActionItemLane } from '../../../../lib/action-item-types';
import { getAdminFirestore } from '../../../../lib/firebase-admin';

/**
 * GET /api/cron/welcome-action-item-expiry
 *
 * Daily cron that scans every agent's action items collection and
 * expires any pending items past their lane-specific expiration window.
 *
 * Phase 1 Track B writes ONLY welcome entries (30-day window per Daniel's
 * locked Q2 — "an unsent welcome action item expires at createdAt + 30d.
 * Rationale: a welcome sent 30+ days after signup is worse than no
 * welcome (signals 'this agent forgot about me')"). The cron itself is
 * lane-agnostic so the Phase 2 anniversary / retention / referral
 * writers get the same hygiene for free.
 *
 * Telemetry: structured `[welcome-action-item-expiry]` log per expired
 * item PLUS aggregate counters in the JSON response. PostHog wiring
 * (`welcome_action_item_expired`) is deferred to a follow-up that
 * introduces server-side PostHog ingestion across all crons — matches
 * Track A's posture (commit `028491e`, "Server-side PostHog
 * instrumentation was not added to cron handlers... PostHog wiring is
 * its own follow-up").
 *
 * Schedule: daily at 16:00 UTC (vercel.json) — runs after the
 * birthday/holiday/anniversary checks so an action item that completes
 * via push earlier in the day is already marked completed before the
 * expiry cron sees it.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const db = getAdminFirestore();
    const agentsSnap = await db.collection('agents').get();

    let agentsScanned = 0;
    let totalScanned = 0;
    let totalExpired = 0;
    const expiredByLane: Partial<Record<ActionItemLane, number>> = {};
    const now = new Date();

    for (const agentDoc of agentsSnap.docs) {
      const agentId = agentDoc.id;
      let result: Awaited<ReturnType<typeof expireOverdueActionItemsForAgent>>;
      try {
        result = await expireOverdueActionItemsForAgent({ db, agentId, now });
      } catch (err) {
        console.error('[welcome-action-item-expiry] agent failed', {
          agentId,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
      agentsScanned += 1;
      totalScanned += result.scanned;
      totalExpired += result.expired;
      for (const lane of Object.keys(result.expiredByLane) as ActionItemLane[]) {
        expiredByLane[lane] = (expiredByLane[lane] ?? 0) + (result.expiredByLane[lane] ?? 0);
      }
      for (const expired of result.expiredItems) {
        // Per-item structured log so the PostHog backfill (when it
        // lands) can replay welcome_action_item_expired from server logs
        // with full context (agentId, clientId via the linked entity,
        // daysQueued).
        console.log('[welcome-action-item-expiry] expired', {
          agentId,
          itemId: expired.itemId,
          lane: expired.lane,
          daysQueued: expired.daysQueued,
        });
      }
    }

    const elapsedMs = Date.now() - startedAt;
    return NextResponse.json({
      success: true,
      agentsScanned,
      itemsScanned: totalScanned,
      itemsExpired: totalExpired,
      expiredByLane,
      elapsedMs,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[welcome-action-item-expiry] cron failed', { error: errMsg });
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
