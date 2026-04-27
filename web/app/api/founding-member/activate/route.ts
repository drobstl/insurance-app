import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';

// Launch decision (April 2026): founding is closed to new signups.
const FOUNDING_SIGNUPS_OPEN = false;

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
    const normalizedEmail = email.trim().toLowerCase();

    const db = getAdminFirestore();

    // Check if already active — no work needed
    const agentDoc = await db.collection('agents').doc(userId).get();
    if (agentDoc.exists && agentDoc.data()?.subscriptionStatus === 'active') {
      return NextResponse.json({ activated: true, alreadyActive: true });
    }

    // Do not allow new free activations while founding is closed.
    if (!FOUNDING_SIGNUPS_OPEN) {
      return NextResponse.json({ activated: false, reason: 'founding_closed' });
    }

    // Look for an approved founding member application with this email.
    // We check both normalized and legacy fields for backward compatibility.
    let hasApprovedApplication = false;

    let fmSnapshot = await db
      .collection('foundingMemberApplications')
      .where('emailLower', '==', normalizedEmail)
      .where('status', '==', 'approved')
      .limit(1)
      .get();
    hasApprovedApplication = !fmSnapshot.empty;

    if (!hasApprovedApplication) {
      fmSnapshot = await db
        .collection('foundingMemberApplications')
        .where('email', '==', normalizedEmail)
        .where('status', '==', 'approved')
        .limit(1)
        .get();
      hasApprovedApplication = !fmSnapshot.empty;
    }

    if (!hasApprovedApplication) {
      fmSnapshot = await db
        .collection('foundingMemberApplications')
        .where('email', '==', email)
        .where('status', '==', 'approved')
        .limit(1)
        .get();
      hasApprovedApplication = !fmSnapshot.empty;
    }

    if (!hasApprovedApplication) {
      const approvedSnapshot = await db
        .collection('foundingMemberApplications')
        .where('status', '==', 'approved')
        .limit(100)
        .get();
      hasApprovedApplication = approvedSnapshot.docs.some((doc) => {
        const value = doc.data().email;
        return typeof value === 'string' && value.trim().toLowerCase() === normalizedEmail;
      });
    }

    if (!hasApprovedApplication) {
      return NextResponse.json({ activated: false, reason: 'no_approved_application' });
    }

    // Capacity check — the tier may have filled since this user was approved
    const activatedSnap = await db
      .collection('agents')
      .where('membershipTier', '==', 'founding')
      .limit(51)
      .get();
    if (activatedSnap.size >= 50) {
      return NextResponse.json({ activated: false, reason: 'founding_full' });
    }

    // Activate the founding member — no Stripe, no credit card
    await db.collection('agents').doc(userId).set(
      {
        emailLower: normalizedEmail,
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
