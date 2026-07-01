import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '../../../../lib/firebase-admin';
import { getChallengeProgress } from '../../../../lib/challenge-stats';

/**
 * GET /api/agent/challenges?tz={offsetMinutes}&sessionStart={epochMs}
 *
 * Returns the requesting agent's "Today's Challenge" progress: daily +
 * weekly dial targets ("beat yesterday" / "beat last week"), the hot
 * streak, and — when `sessionStart` is supplied — the Power Hour session
 * dial count. Computed on-demand; see `lib/challenge-stats.ts`.
 *
 * `tz` is the client's `new Date().getTimezoneOffset()` so day buckets
 * land on the agent's local midnight, not UTC.
 *
 * Auth: Bearer ID token (the agent reads their own data).
 */
export async function GET(req: NextRequest) {
  try {
    // Flag defense in depth — the UI self-hides when off, but the
    // endpoint shouldn't be reachable either. Read the env directly here
    // rather than importing the client-marked feature-flags module.
    if (process.env.NEXT_PUBLIC_CHALLENGES_ENABLED !== 'true') {
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

    const tzRaw = Number(req.nextUrl.searchParams.get('tz'));
    // Valid offsets span -840..+720; fall back to UTC on anything weird.
    const tzOffsetMinutes =
      Number.isFinite(tzRaw) && Math.abs(tzRaw) <= 840 ? tzRaw : 0;

    const sessionRaw = req.nextUrl.searchParams.get('sessionStart');
    const sessionStartMs =
      sessionRaw !== null && Number.isFinite(Number(sessionRaw))
        ? Number(sessionRaw)
        : null;

    const progress = await getChallengeProgress(agentId, {
      tzOffsetMinutes,
      sessionStartMs,
    });
    return NextResponse.json(progress);
  } catch (error) {
    console.error('agent/challenges error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const maxDuration = 30;
