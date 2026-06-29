import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';

import { getAdminFirestore } from '../../../../lib/firebase-admin';

/**
 * GET /api/cron/lead-follow-up-signals
 *
 * Daily sweep — the non-app side of smart follow-up Step 2. Scans every
 * agent's leads and auto-sets `followUpAt` from timing signals that don't
 * depend on the lead downloading the app, so dormant leads resurface in the
 * agent's "Follow-ups due" (Leads list + Action items) instead of rotting.
 *
 * Signal in this pass:
 *   - GOING COLD: a worked lead (dialed at least once) not reached in
 *     COLD_DAYS+, not converted / DNC / booked → resurface today.
 *
 * Idempotency (the load-bearing safety):
 *   - never overwrite an existing `followUpAt` (manual or prior auto-set)
 *   - stamp `autoFollowUpAt` when we surface, and skip any lead auto-surfaced
 *     within COOLDOWN_DAYS — so dismissing one (clearing followUpAt) does NOT
 *     bring it back tomorrow. The cooldown marker is never cleared by Done.
 *
 * Future signals plug into the same loop (thinking-it-over, birthday/age-up,
 * smart re-attempt rhythm) — each just another guarded `followUpAt` set.
 *
 * Auth: Vercel cron `Authorization: Bearer ${CRON_SECRET}`.
 */

const COLD_DAYS = 21;
const COOLDOWN_DAYS = 30;
const PER_AGENT_LIMIT = 400;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const counts = {
    agentsScanned: 0,
    candidates: 0,
    surfaced: 0,
    skipped: 0,
    cappedAgents: 0,
    errors: 0,
  };

  try {
    const db = getAdminFirestore();
    const nowMs = Date.now();
    const nowTs = Timestamp.fromMillis(nowMs);
    const coldCutoff = Timestamp.fromMillis(nowMs - COLD_DAYS * 24 * 60 * 60 * 1000);
    const cooldownCutoffMs = nowMs - COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

    const agentsSnap = await db.collection('agents').get();

    for (const agentDoc of agentsSnap.docs) {
      counts.agentsScanned++;
      const agentId = agentDoc.id;

      let coldSnap;
      try {
        coldSnap = await db
          .collection('agents').doc(agentId).collection('leads')
          .where('lastDialAt', '<=', coldCutoff)
          .orderBy('lastDialAt', 'asc')
          .limit(PER_AGENT_LIMIT)
          .get();
      } catch (err) {
        counts.errors++;
        console.error('[lead-follow-up-signals] cold query failed', { agentId, err: errMsg(err) });
        continue;
      }

      if (coldSnap.size === PER_AGENT_LIMIT) {
        counts.cappedAgents++;
        console.warn('[lead-follow-up-signals] agent hit per-run cap', { agentId, cap: PER_AGENT_LIMIT });
      }

      for (const leadDoc of coldSnap.docs) {
        counts.candidates++;
        const lead = leadDoc.data() as {
          followUpAt?: Timestamp | null;
          autoFollowUpAt?: Timestamp | null;
          convertedToClientId?: string | null;
          lastDialOutcome?: string;
        };

        // Guards (any → skip):
        if (lead.followUpAt) { counts.skipped++; continue; }            // already has a follow-up
        if (lead.convertedToClientId) { counts.skipped++; continue; }   // already a client
        if (lead.lastDialOutcome === 'do_not_call' || lead.lastDialOutcome === 'booked') {
          counts.skipped++;
          continue;
        }
        const autoMs =
          lead.autoFollowUpAt && typeof lead.autoFollowUpAt.toMillis === 'function'
            ? lead.autoFollowUpAt.toMillis()
            : null;
        if (autoMs != null && autoMs > cooldownCutoffMs) { counts.skipped++; continue; } // cooldown

        try {
          await leadDoc.ref.update({
            followUpAt: nowTs,
            followUpNote: `No contact in ${COLD_DAYS}+ days — circle back before it goes cold`,
            autoFollowUpAt: nowTs,
            autoFollowUpReason: 'going_cold',
          });
          counts.surfaced++;
        } catch (err) {
          counts.errors++;
          console.error('[lead-follow-up-signals] update failed', { agentId, leadId: leadDoc.id, err: errMsg(err) });
        }
      }
    }

    const elapsedMs = Date.now() - startedAt;
    console.log('[lead-follow-up-signals] done', { ...counts, elapsedMs });
    return NextResponse.json({ ok: true, ...counts, elapsedMs });
  } catch (error) {
    console.error('[lead-follow-up-signals] fatal', errMsg(error));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const runtime = 'nodejs';
export const maxDuration = 300;
