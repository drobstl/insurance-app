import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';

/**
 * POST /api/clients/match-referral
 *
 * Given a client's phone number, checks the agent's referrals for a matching
 * `referralPhone`. If found, writes `sourceReferralId` on the client document
 * so the client is linked back to the referral that originated them.
 *
 * Body: { clientId: string, clientPhone: string }
 * Auth: Bearer <Firebase ID token>
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decoded = await getAdminAuth().verifyIdToken(token);
    const agentId = decoded.uid;

    const { clientId, clientPhone } = await req.json();

    if (!clientId || !clientPhone) {
      return NextResponse.json(
        { error: 'Missing required fields: clientId, clientPhone' },
        { status: 400 },
      );
    }

    const normalized = normalizePhone(clientPhone);
    if (!isValidE164(normalized)) {
      return NextResponse.json({ matched: false });
    }

    const db = getAdminFirestore();

    const referralsSnap = await db
      .collection('agents')
      .doc(agentId)
      .collection('referrals')
      .where('referralPhone', '==', normalized)
      .limit(1)
      .get();

    if (referralsSnap.empty) {
      return NextResponse.json({ matched: false });
    }

    const referralId = referralsSnap.docs[0].id;

    await db
      .collection('agents')
      .doc(agentId)
      .collection('clients')
      .doc(clientId)
      .update({ sourceReferralId: referralId });

    return NextResponse.json({ matched: true, referralId });
  } catch (error) {
    console.error('Error matching referral:', error);

    if (error instanceof Error && error.message.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: 'Failed to match referral' },
      { status: 500 },
    );
  }
}
