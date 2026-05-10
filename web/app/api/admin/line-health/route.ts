import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { isAdminEmail } from '../../../../lib/admin';
import {
  getLineHealthSnapshot,
  setManualOverride,
  type LineHealthTier,
} from '../../../../lib/line-health';

/**
 * Admin-only Linq line-health snapshot + manual override.
 *
 * GET — return 7-day rolling counters, auto-classified tier, and
 * manual override (if any). Read by the admin widget on
 * `/dashboard/admin/line-health`.
 *
 * POST — set or clear the manual override tier. Used when Linq's PSM
 * sends a downgrade warning email and the admin needs to pin Tier 3
 * or 4 immediately. Body: `{ tier: 0 | 1 | 2 | 3 | 4 | null,
 * reason?: string }` — `null` clears the override.
 *
 * Auth: Bearer <Firebase ID token>, gated to admin emails via
 * `isAdminEmail`.
 */

async function authAdmin(request: NextRequest): Promise<{ ok: true; uid: string } | { ok: false; status: number; error: string }> {
  const authHeader = request.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer (.+)$/i);
  if (!match) return { ok: false, status: 401, error: 'Unauthorized' };
  const token = match[1];
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (!isAdminEmail(decoded.email)) {
      return { ok: false, status: 403, error: 'Admin only' };
    }
    return { ok: true, uid: decoded.uid };
  } catch {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
}

export async function GET(request: NextRequest) {
  const auth = await authAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const db = getAdminFirestore();
    const snapshot = await getLineHealthSnapshot({ db });
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error('[line-health-api] GET failed', error);
    return NextResponse.json(
      { error: 'Failed to fetch line health snapshot' },
      { status: 500 },
    );
  }
}

const VALID_TIERS: ReadonlyArray<LineHealthTier> = [0, 1, 2, 3, 4];

function isValidTier(value: unknown): value is LineHealthTier {
  return typeof value === 'number' && VALID_TIERS.includes(value as LineHealthTier);
}

export async function POST(request: NextRequest) {
  const auth = await authAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const body = (await request.json().catch(() => null)) as {
      tier?: unknown;
      reason?: unknown;
    } | null;
    const rawTier = body?.tier;
    const reason =
      typeof body?.reason === 'string' && body.reason.trim().length > 0
        ? body.reason.trim()
        : null;

    let tier: LineHealthTier | null;
    if (rawTier === null) {
      tier = null;
    } else if (isValidTier(rawTier)) {
      tier = rawTier;
    } else {
      return NextResponse.json(
        { error: 'tier must be 0 | 1 | 2 | 3 | 4 | null' },
        { status: 400 },
      );
    }

    const db = getAdminFirestore();
    await setManualOverride({
      db,
      tier,
      reason,
      setBy: auth.uid,
    });
    const snapshot = await getLineHealthSnapshot({ db });
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error('[line-health-api] POST failed', error);
    return NextResponse.json(
      { error: 'Failed to set manual override' },
      { status: 500 },
    );
  }
}
