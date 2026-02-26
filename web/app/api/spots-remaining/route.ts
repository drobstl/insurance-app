import 'server-only';

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../lib/firebase-admin';

const TIERS = [
  { id: 'founding', name: 'Founding Members', total: 50 },
  { id: 'charter', name: 'Charter Members', total: 50 },
  { id: 'inner_circle', name: 'Inner Circle', total: 50 },
] as const;

type TierId = (typeof TIERS)[number]['id'];

export async function GET() {
  try {
    const firestore = getAdminFirestore();

    // Count founding members from the applications collection (approved)
    const approvedSnap = await firestore
      .collection('foundingMemberApplications')
      .where('status', '==', 'approved')
      .get();
    const foundingCount = approvedSnap.size;

    // Count charter and inner_circle members from agent docs
    const charterSnap = await firestore
      .collection('agents')
      .where('membershipTier', '==', 'charter')
      .get();
    const charterCount = charterSnap.size;

    const innerCircleSnap = await firestore
      .collection('agents')
      .where('membershipTier', '==', 'inner_circle')
      .get();
    const innerCircleCount = innerCircleSnap.size;

    const counts: Record<TierId, number> = {
      founding: foundingCount,
      charter: charterCount,
      inner_circle: innerCircleCount,
    };

    // Determine which tier is currently open
    let activeTierIndex: number = TIERS.length; // default: all full → standard
    for (let i = 0; i < TIERS.length; i++) {
      if (counts[TIERS[i].id] < TIERS[i].total) {
        activeTierIndex = i;
        break;
      }
    }

    const activeTier = activeTierIndex < TIERS.length ? TIERS[activeTierIndex] : null;
    const spotsRemaining = activeTier
      ? Math.max(0, activeTier.total - counts[activeTier.id])
      : 0;

    return NextResponse.json(
      {
        activeTier: activeTier?.id ?? 'standard',
        activeTierName: activeTier?.name ?? 'Standard',
        totalSpots: activeTier?.total ?? null,
        spotsFilled: activeTier ? counts[activeTier.id] : null,
        spotsRemaining,
        tiers: TIERS.map((tier, i) => ({
          ...tier,
          status:
            i === activeTierIndex
              ? 'open'
              : i < activeTierIndex
                ? 'full'
                : 'upcoming',
          spotsFilled: counts[tier.id],
          spotsRemaining: Math.max(0, tier.total - counts[tier.id]),
        })),
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      },
    );
  } catch (error) {
    console.error('Error fetching spots remaining:', error);
    return NextResponse.json(
      { error: 'Failed to fetch spots' },
      { status: 500 },
    );
  }
}
