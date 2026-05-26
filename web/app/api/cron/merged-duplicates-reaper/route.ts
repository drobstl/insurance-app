import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../../../../lib/firebase-admin';

/**
 * GET /api/cron/merged-duplicates-reaper
 *
 * Daily hygiene cron. Hard-deletes the placeholder client docs that
 * remain after a duplicate-into-canonical merge, once they've been
 * soft-deleted for at least 30 days. This keeps the agent's
 * `agents/{uid}/clients/*` subcollection clean for admin exports and
 * future migrations.
 *
 * What it does NOT delete:
 *   • `agents/{uid}/clientMerges/{journalId}` — audit/un-merge record.
 *     Kept indefinitely; tiny per-doc.
 *   • `clientCodes/{dupCode}` — share-link redirect to canonical.
 *     Old share links must not break, so these live forever.
 *
 * The matcher already excludes `deleted: true` clients from scans, so
 * the only visible effect of this cron is admin-export cleanliness.
 *
 * Schedule: daily at 17:30 UTC (after the other content/expiry crons).
 * Auth: Bearer ${CRON_SECRET}.
 */

const RECOVERY_WINDOW_DAYS = 30;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const cutoff = Timestamp.fromMillis(
    Date.now() - RECOVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  let reaped = 0;
  let agentsTouched = 0;
  let errors = 0;

  try {
    const db = getAdminFirestore();

    // collectionGroup over every `clients` subcollection picks up all
    // agents in one query (subject to a composite-index requirement,
    // see firestore.indexes.json).
    const snap = await db
      .collectionGroup('clients')
      .where('deleted', '==', true)
      .where('mergedAt', '<', cutoff)
      .get();

    if (snap.empty) {
      return NextResponse.json({
        ok: true,
        reaped: 0,
        agentsTouched: 0,
        elapsedMs: Date.now() - startedAt,
      });
    }

    // Chunked deletes — Firestore batches max at 500 ops, but we
    // process per-doc to keep the inner loop simple. Could batch if
    // we ever see thousands per run.
    const seenAgents = new Set<string>();
    for (const doc of snap.docs) {
      try {
        // Defensive: only hard-delete docs that carry mergedInto.
        // Soft-deleted clients without a merge anchor shouldn't exist
        // today, but if they ever do (e.g., a manual-delete code path
        // adds `deleted: true`) we'd rather leave them alone.
        const data = doc.data();
        if (typeof data.mergedInto !== 'string' || !data.mergedInto) continue;

        await doc.ref.delete();
        reaped++;
        const agentId = doc.ref.parent.parent?.id;
        if (agentId) seenAgents.add(agentId);
      } catch (err) {
        errors++;
        console.error('[merged-duplicates-reaper] delete failed', {
          path: doc.ref.path,
          error: err instanceof Error ? err.message : err,
        });
      }
    }
    agentsTouched = seenAgents.size;

    console.log('[merged-duplicates-reaper] complete', {
      reaped, agentsTouched, errors, elapsedMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      ok: true,
      reaped,
      agentsTouched,
      errors,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (err) {
    console.error('[merged-duplicates-reaper] fatal', err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'unknown',
        reaped,
        agentsTouched,
      },
      { status: 500 },
    );
  }
}
