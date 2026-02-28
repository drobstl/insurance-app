import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const match = authHeader.match(/^Bearer (.+)$/i);
    if (!match) {
      return NextResponse.json({ activated: false, reason: 'unauthorized' }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifyIdToken(match[1]);
    const userId = decoded.uid;
    const email = decoded.email;

    if (!email) {
      return NextResponse.json({ activated: false, reason: 'no_email' }, { status: 400 });
    }

    const db = getAdminFirestore();

    // Check if already active — no work needed
    const agentDoc = await db.collection('agents').doc(userId).get();
    if (agentDoc.exists && agentDoc.data()?.subscriptionStatus === 'active') {
      return NextResponse.json({ activated: true, alreadyActive: true });
    }

    // Look for an approved founding member application with this email
    const fmSnapshot = await db
      .collection('foundingMemberApplications')
      .where('email', '==', email)
      .where('status', '==', 'approved')
      .limit(1)
      .get();

    if (fmSnapshot.empty) {
      return NextResponse.json({ activated: false, reason: 'no_approved_application' });
    }

    // Activate the founding member — no Stripe, no credit card
    await db.collection('agents').doc(userId).set(
      {
        subscriptionStatus: 'active',
        isFoundingMember: true,
        foundingMemberApprovedAt: new Date(),
        membershipTier: 'founding',
      },
      { merge: true }
    );

    return NextResponse.json({ activated: true });
  } catch (error) {
    console.error('Error activating founding member:', error);
    return NextResponse.json(
      { activated: false, reason: 'server_error' },
      { status: 500 }
    );
  }
}
