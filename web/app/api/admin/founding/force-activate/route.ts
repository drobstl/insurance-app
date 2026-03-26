import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { DocumentReference } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../../lib/firebase-admin';
import { isAdminEmail } from '../../../../../lib/admin';

/**
 * POST /api/admin/founding/force-activate
 * Body: { email: string }
 *
 * Force-activates an existing agent account as a founding member by email.
 * Intended for support/admin recovery when an approved founder is stuck behind
 * the subscription gate.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (!isAdminEmail(decoded.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const normalizedEmail =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!normalizedEmail) {
      return NextResponse.json({ error: 'Missing email' }, { status: 400 });
    }

    const firestore = getAdminFirestore();

    let agentRef: DocumentReference | null = null;

    const agentByLowerSnapshot = await firestore
      .collection('agents')
      .where('emailLower', '==', normalizedEmail)
      .limit(1)
      .get();
    if (!agentByLowerSnapshot.empty) {
      agentRef = agentByLowerSnapshot.docs[0].ref;
    }

    if (!agentRef) {
      const agentByEmailSnapshot = await firestore
        .collection('agents')
        .where('email', '==', normalizedEmail)
        .limit(1)
        .get();
      if (!agentByEmailSnapshot.empty) {
        agentRef = agentByEmailSnapshot.docs[0].ref;
      }
    }

    if (!agentRef) {
      const scanSnapshot = await firestore.collection('agents').limit(500).get();
      const matched = scanSnapshot.docs.find((doc) => {
        const value = doc.data().email;
        return typeof value === 'string' && value.trim().toLowerCase() === normalizedEmail;
      });
      if (matched) {
        agentRef = matched.ref;
      }
    }

    if (!agentRef) {
      return NextResponse.json({ error: 'Agent not found for that email' }, { status: 404 });
    }

    await agentRef.set(
      {
        emailLower: normalizedEmail,
        subscriptionStatus: 'active',
        membershipTier: 'founding',
        isFoundingMember: true,
        foundingMemberApprovedAt: new Date(),
      },
      { merge: true }
    );

    // Keep application state aligned if one exists for this email.
    let applicationSnapshot = await firestore
      .collection('foundingMemberApplications')
      .where('emailLower', '==', normalizedEmail)
      .limit(1)
      .get();

    if (applicationSnapshot.empty) {
      applicationSnapshot = await firestore
        .collection('foundingMemberApplications')
        .where('email', '==', normalizedEmail)
        .limit(1)
        .get();
    }

    if (!applicationSnapshot.empty) {
      await applicationSnapshot.docs[0].ref.set(
        {
          email: normalizedEmail,
          emailLower: normalizedEmail,
          status: 'approved',
          approvedAt: new Date(),
        },
        { merge: true }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Activated founding access for ${normalizedEmail}.`,
    });
  } catch (error) {
    console.error('Force founding activate error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to force activate founding' },
      { status: 500 }
    );
  }
}
