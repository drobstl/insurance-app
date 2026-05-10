import 'server-only';

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../lib/firebase-admin';

/**
 * GET /api/spots-remaining
 *
 * Track C (May 10, 2026): trimmed down to founding-tier count only.
 * The legacy charter/inner_circle/standard tier-ladder data is gone
 * — those tiers were deleted with v3 pricing. The endpoint now only
 * exists to back the admin founding-member applications page's
 * "X of 50 founding spots filled" badge and its 409-on-full
 * approval guard.
 *
 * Older landing-page variants (`/m/v2`, `/d`) also fetch this URL,
 * but their `.catch` handlers swallow failures silently — they
 * pre-date the current `/v5` and `/m` canonical landings and aren't
 * primary marketing surfaces.
 */
export async function GET() {
  try {
    const firestore = getAdminFirestore();
    const FOUNDING_TOTAL = 50;

    const approvedSnap = await firestore
      .collection('foundingMemberApplications')
      .where('status', '==', 'approved')
      .get();
    const filled = approvedSnap.size;
    const remaining = Math.max(0, FOUNDING_TOTAL - filled);

    const foundingTier = {
      id: 'founding',
      name: 'Founding Members',
      total: FOUNDING_TOTAL,
      status: remaining > 0 ? ('open' as const) : ('full' as const),
      spotsFilled: filled,
      spotsRemaining: remaining,
    };

    return NextResponse.json(
      {
        // Kept top-level shape compatible with the admin page's
        // `if (d.tiers)` guard. Older landing-page variants that
        // expected the full charter/inner_circle/standard ladder
        // see only `founding` here; their tier-rendering code that
        // can't find their target tier id falls through to its
        // default upcoming/full state silently.
        activeTier: remaining > 0 ? 'founding' : 'standard',
        activeTierName: remaining > 0 ? 'Founding Members' : 'Standard',
        totalSpots: FOUNDING_TOTAL,
        spotsFilled: filled,
        spotsRemaining: remaining,
        tiers: [foundingTier],
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      },
    );
  } catch (error) {
    console.error('[spots-remaining] error', error);
    return NextResponse.json(
      { error: 'Failed to fetch spots' },
      { status: 500 },
    );
  }
}
