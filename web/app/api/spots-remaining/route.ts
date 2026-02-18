import 'server-only';

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../lib/firebase-admin';

const TIERS = [
  { id: 'founding', name: 'Founding Members', total: 50 },
  { id: 'charter', name: 'Charter Members', total: 50 },
  { id: 'inner-circle', name: 'Inner Circle', total: 50 },
] as const;

export async function GET() {
  try {
    const firestore = getAdminFirestore();

    const approvedSnap = await firestore
      .collection('foundingMemberApplications')
      .where('status', '==', 'approved')
      .get();

    const approvedCount = approvedSnap.size;

    const activeTier = TIERS[0];
    const spotsRemaining = Math.max(0, activeTier.total - approvedCount);

    return NextResponse.json({
      activeTier: activeTier.id,
      activeTierName: activeTier.name,
      totalSpots: activeTier.total,
      spotsFilled: approvedCount,
      spotsRemaining,
      tiers: TIERS.map((tier, i) => ({
        ...tier,
        status: i === 0 ? 'open' : 'upcoming',
        spotsFilled: i === 0 ? approvedCount : 0,
        spotsRemaining: i === 0 ? spotsRemaining : tier.total,
      })),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    console.error('Error fetching spots remaining:', error);
    return NextResponse.json(
      { error: 'Failed to fetch spots' },
      { status: 500 }
    );
  }
}
