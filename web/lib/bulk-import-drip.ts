import 'server-only';

import { queueOrRefreshWelcomeActionItem } from './welcome-action-item-writer';

/**
 * Bulk-import drip release — shared helper.
 *
 * Releases up to N pending bulk-import clients into the agent's welcome
 * action item queue. Called from two places:
 *
 *   1. The daily cron (`/api/cron/bulk-import-drip-release`) — scans
 *      every agent at 1 PM UTC and releases the next batch.
 *
 *   2. The bulk-import activate handler (`/api/clients/import-batch`) —
 *      fires the moment the agent completes the import so the first 15
 *      welcomes land in their queue immediately, not the morning after.
 *
 * Strict 15-per-UTC-day cap is enforced across BOTH paths via two fields
 * on the agent doc:
 *   - `lastBulkImportDripReleasedAt` — ISO timestamp of the most recent
 *     release call that released ≥1 client.
 *   - `bulkImportDripReleasedTodayCount` — count released so far on the
 *     same UTC day. Resets when a new UTC day is observed.
 *
 * Rationale for the cap: welcomes go out from the AGENT's personal phone
 * number via `sms:` URLs (per Linq's bulk-import policy). Carriers flag
 * personal numbers that suddenly send 50+ outbound texts in a day. 15/day
 * keeps activity inside normal-human territory.
 */

export const DAILY_DRIP_LIMIT = 15;

export interface DripReleaseOutcome {
  released: number;
  skippedNoPhone: number;
  skippedAlreadyComplete: number;
  pendingAfter: number;
  /** True if the agent already hit today's UTC cap — no candidates were released. */
  sameDayCapReached: boolean;
  /** Remaining slots agent could still receive today before hitting the cap. */
  slotsRemainingToday: number;
}

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function releaseDripForAgent(params: {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  /** Override the daily cap (default 15). Lower values useful for testing. */
  limit?: number;
}): Promise<DripReleaseOutcome> {
  const limit = params.limit ?? DAILY_DRIP_LIMIT;
  const now = new Date();
  const nowIso = now.toISOString();
  const todayKey = utcDayKey(now);

  const agentRef = params.db.collection('agents').doc(params.agentId);
  const agentSnap = await agentRef.get();
  const agentData = agentSnap.exists ? agentSnap.data() ?? {} : {};

  const lastReleasedAt =
    typeof agentData.lastBulkImportDripReleasedAt === 'string'
      ? agentData.lastBulkImportDripReleasedAt
      : null;
  const lastReleasedDay = lastReleasedAt ? utcDayKey(new Date(lastReleasedAt)) : null;
  const releasedTodayRaw = agentData.bulkImportDripReleasedTodayCount;
  const alreadyReleasedToday =
    lastReleasedDay === todayKey && typeof releasedTodayRaw === 'number'
      ? releasedTodayRaw
      : 0;

  const remainingSlots = Math.max(0, limit - alreadyReleasedToday);

  if (remainingSlots === 0) {
    // Already hit today's cap — count remaining pending so callers can
    // tell the agent what's still in queue.
    const pendingAfter = await agentRef
      .collection('clients')
      .where('bulkImportPendingDrip', '==', true)
      .count()
      .get();
    return {
      released: 0,
      skippedNoPhone: 0,
      skippedAlreadyComplete: 0,
      pendingAfter: pendingAfter.data().count,
      sameDayCapReached: true,
      slotsRemainingToday: 0,
    };
  }

  // Order by most-recent policy effective date first so the agent's
  // welcome queue surfaces the freshest policies before older ones —
  // those are the clients most likely to remember the agent and engage
  // with a setup text. `bulkImportLatestPolicyEffectiveDate` is
  // denormalized onto the client doc at import time (see
  // /api/clients/import-batch) as YYYY-MM-DD or '' when no policy had
  // a parseable date; the empty-string default keeps date-less clients
  // in the result set, sorted last under DESC.
  const candidatesSnap = await agentRef
    .collection('clients')
    .where('bulkImportPendingDrip', '==', true)
    .orderBy('bulkImportLatestPolicyEffectiveDate', 'desc')
    .limit(remainingSlots)
    .get();

  let released = 0;
  let skippedNoPhone = 0;
  let skippedAlreadyComplete = 0;

  for (const clientDoc of candidatesSnap.docs) {
    const clientId = clientDoc.id;
    try {
      const result = await queueOrRefreshWelcomeActionItem({
        db: params.db,
        agentId: params.agentId,
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
      } else if (result.outcome === 'skipped_already_completed') {
        skippedAlreadyComplete++;
      } else {
        released++;
      }

      await clientDoc.ref.update(clearUpdate);
    } catch (err) {
      // Don't clear the flag — the client stays in the pool for the
      // next pass. Protects against transient failures.
      console.error('[bulk-import-drip] release failed for client (non-blocking)', {
        agentId: params.agentId,
        clientId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const pendingAfter = await agentRef
    .collection('clients')
    .where('bulkImportPendingDrip', '==', true)
    .count()
    .get();

  // Stamp the agent counter only when we actually released ≥1. This
  // means an empty pool doesn't lock out the agent — they could import
  // again same day and the immediate release would still fire (up to
  // the remaining slot count).
  if (released > 0 || skippedNoPhone > 0 || skippedAlreadyComplete > 0) {
    const newTodayCount =
      (lastReleasedDay === todayKey ? alreadyReleasedToday : 0) +
      released +
      skippedNoPhone +
      skippedAlreadyComplete;
    await agentRef.set(
      {
        lastBulkImportDripReleasedAt: nowIso,
        bulkImportDripReleasedTodayCount: newTodayCount,
      },
      { merge: true },
    );
  }

  return {
    released,
    skippedNoPhone,
    skippedAlreadyComplete,
    pendingAfter: pendingAfter.data().count,
    sameDayCapReached: false,
    slotsRemainingToday: Math.max(
      0,
      limit - alreadyReleasedToday - released - skippedNoPhone - skippedAlreadyComplete,
    ),
  };
}
