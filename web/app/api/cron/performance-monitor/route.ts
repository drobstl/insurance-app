import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { runPerformanceMonitor } from '../../../../lib/performance-monitor';

/**
 * GET /api/cron/performance-monitor
 *
 * Daily cron: computes performance snapshots for each conversation type,
 * checks for regressions, and auto-rolls back if a strategy version
 * is performing significantly worse than its predecessor.
 *
 * Schedule: 0 9 * * * (9 AM UTC daily)
 */

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await runPerformanceMonitor();

    const summary = results.map((r) => ({
      type: r.type,
      strategyVersion: r.snapshot.strategyVersion,
      successRate: r.snapshot.successRate,
      baseline: r.snapshot.baselineSuccessRate,
      delta: r.snapshot.delta,
      regressionDetected: r.regressionDetected,
      rolledBack: r.rolledBack,
      sampleSize: r.snapshot.conversationsCompleted,
    }));

    return NextResponse.json({ success: true, results: summary });
  } catch (error) {
    console.error('Performance monitor cron error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
