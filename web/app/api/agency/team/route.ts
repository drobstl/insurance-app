import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { getTeamOverview } from '../../../../lib/agency-team';
import type { ActivityRange } from '../../../../lib/activity-stats';

/**
 * GET /api/agency/team
 *
 * The agency owner's "My Team" dashboard payload. Gated to agents flagged
 * `isAgencyOwner: true`. Returns the owner's own pen + each downline
 * member's headline metrics and coaching radar + an agency-wide rollup.
 * Performance metrics only — no downline client PII (see lib/agency-team).
 *
 * Query: ?range=today|week|month|last30|ytd (default month)
 *        &coachingDays=14|28 (default 28)
 * Auth: Bearer <Firebase ID token>
 */

const VALID_RANGES: readonly string[] = ['today', 'week', 'month', 'last30', 'ytd'];

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const match = authHeader.match(/^Bearer (.+)$/i);
    if (!match) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    let uid: string;
    try {
      const decoded = await getAdminAuth().verifyIdToken(match[1]);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // Gate: only designated agency owners may see a downline.
    const ownerSnap = await getAdminFirestore().collection('agents').doc(uid).get();
    const ownerData = ownerSnap.data() ?? {};
    if (ownerData.isAgencyOwner !== true) {
      return NextResponse.json({ error: 'not_agency_owner' }, { status: 403 });
    }
    const ownerName =
      typeof ownerData.name === 'string' && ownerData.name.trim().length > 0
        ? ownerData.name.trim()
        : 'You';

    const url = new URL(request.url);
    const rangeParam = url.searchParams.get('range');
    const range: ActivityRange = VALID_RANGES.includes(rangeParam ?? '')
      ? (rangeParam as ActivityRange)
      : 'month';
    const daysParam = Number(url.searchParams.get('coachingDays'));
    const coachingWindowDays = daysParam === 14 ? 14 : 28;

    const overview = await getTeamOverview(uid, ownerName, range, coachingWindowDays);
    return NextResponse.json(overview);
  } catch (error) {
    console.error('[agency/team] error', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
