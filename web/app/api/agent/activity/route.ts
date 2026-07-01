import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '../../../../lib/firebase-admin';
import { getActivityStats, type ActivityRange } from '../../../../lib/activity-stats';

const VALID_RANGES: ReadonlySet<ActivityRange> = new Set([
  'today',
  'week',
  'month',
  'last30',
  'ytd',
]);

/**
 * GET /api/agent/activity?range={today|week|month|last30|ytd}
 *
 * Returns aggregated activity stats for the requesting agent over the
 * given time range. Computed on-demand — no cache, no denormalized
 * rollup docs. See `web/lib/activity-stats.ts` for the aggregation
 * logic + source-attribution heuristic.
 *
 * Auth: Bearer ID token (the agent reads their own data).
 */
export async function GET(req: NextRequest) {
  try {
    // Feature flag defense in depth — the UI page redirects when the
    // flag is off, but the API endpoint shouldn't be reachable
    // either. Read process.env directly here rather than importing
    // the client-marked feature-flags module from a server-only route.
    if (process.env.NEXT_PUBLIC_ACTIVITY_ENABLED !== 'true') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });

    let decoded;
    try {
      decoded = await getAdminAuth().verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }
    const agentId = decoded.uid;

    const rawRange = req.nextUrl.searchParams.get('range') || 'month';
    const range = (VALID_RANGES.has(rawRange as ActivityRange)
      ? rawRange
      : 'month') as ActivityRange;

    // The agent's browser time zone (IANA, e.g. 'America/Chicago') so that
    // "Today" / "This month" anchor to the agent's own clock, not the
    // server's UTC. getActivityStats validates it and falls back to UTC.
    const timeZone = req.nextUrl.searchParams.get('tz') || undefined;

    const stats = await getActivityStats(agentId, range, timeZone);
    return NextResponse.json(stats);
  } catch (error) {
    console.error('agent/activity error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const maxDuration = 30;
