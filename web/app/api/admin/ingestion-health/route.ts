import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { isAdminEmail } from '../../../../lib/admin';

function toMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value === 'object') {
    const candidate = value as {
      toDate?: () => Date;
      seconds?: number;
      _seconds?: number;
    };
    if (typeof candidate.toDate === 'function') {
      const date = candidate.toDate();
      const ms = date.getTime();
      return Number.isNaN(ms) ? null : ms;
    }
    const seconds = typeof candidate.seconds === 'number' ? candidate.seconds : candidate._seconds;
    if (typeof seconds === 'number') return seconds * 1000;
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (!isAdminEmail(decoded.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = getAdminFirestore();
    const baseRef = db.collection('systemMetrics').doc('ingestionV3');
    const latestSnap = await baseRef.get();
    const latestRaw = (latestSnap.data()?.staleBatchReconcile || null) as Record<string, unknown> | null;

    const runsSnap = await baseRef
      .collection('staleBatchReconcileRuns')
      .orderBy('createdAt', 'desc')
      .limit(72)
      .get();

    const runs = runsSnap.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        scannedAgents: typeof data.scanned_agents === 'number' ? data.scanned_agents : 0,
        scannedBatches: typeof data.scanned_batches === 'number' ? data.scanned_batches : 0,
        staleCandidates: typeof data.stale_candidates === 'number' ? data.stale_candidates : 0,
        reconciledBatches: typeof data.reconciled_batches === 'number' ? data.reconciled_batches : 0,
        agentScanLimitHit: data.agent_scan_limit_hit === true,
        perAgentBatchScanLimitHitCount:
          typeof data.per_agent_batch_scan_limit_hit_count === 'number'
            ? data.per_agent_batch_scan_limit_hit_count
            : 0,
        createdAtMs: toMillis(data.createdAt),
      };
    });

    const nowMs = Date.now();
    const dayAgoMs = nowMs - 24 * 60 * 60 * 1000;
    const runs24h = runs.filter((run) => typeof run.createdAtMs === 'number' && run.createdAtMs >= dayAgoMs);
    const limitHitRuns24h = runs24h.filter(
      (run) => run.agentScanLimitHit || run.perAgentBatchScanLimitHitCount > 0,
    ).length;

    const summary24h = {
      totalRuns: runs24h.length,
      limitHitRuns: limitHitRuns24h,
      staleCandidates: runs24h.reduce((sum, run) => sum + run.staleCandidates, 0),
      reconciledBatches: runs24h.reduce((sum, run) => sum + run.reconciledBatches, 0),
    };

    const latest = latestRaw
      ? {
          scannedAgents: typeof latestRaw.scanned_agents === 'number' ? latestRaw.scanned_agents : 0,
          scannedBatches: typeof latestRaw.scanned_batches === 'number' ? latestRaw.scanned_batches : 0,
          staleCandidates: typeof latestRaw.stale_candidates === 'number' ? latestRaw.stale_candidates : 0,
          reconciledBatches: typeof latestRaw.reconciled_batches === 'number' ? latestRaw.reconciled_batches : 0,
          agentScanLimit: typeof latestRaw.agent_scan_limit === 'number' ? latestRaw.agent_scan_limit : 0,
          perAgentBatchScanLimit:
            typeof latestRaw.per_agent_batch_scan_limit === 'number'
              ? latestRaw.per_agent_batch_scan_limit
              : 0,
          agentScanLimitHit: latestRaw.agent_scan_limit_hit === true,
          perAgentBatchScanLimitHitCount:
            typeof latestRaw.per_agent_batch_scan_limit_hit_count === 'number'
              ? latestRaw.per_agent_batch_scan_limit_hit_count
              : 0,
          updatedAtMs: toMillis(latestRaw.updatedAt),
        }
      : null;

    return NextResponse.json({
      latest,
      summary24h,
      recentRuns: runs.slice(0, 20),
    });
  } catch (error) {
    console.error('Admin ingestion health error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load ingestion health' },
      { status: 500 },
    );
  }
}
