import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/referral/notify
 *
 * Called by the mobile app after a client sends a referral SMS.
 * Creates a referral record in Firestore so the AI knows to expect
 * incoming messages from the referred person.
 *
 * Body: { agentId, clientId, clientName, referralName, referralPhone }
 */
export async function POST(req: NextRequest) {
  try {
    const { agentId, clientId, clientName, referralName, referralPhone } = await req.json();

    if (!agentId || !referralPhone) {
      return NextResponse.json(
        { error: 'Missing required fields: agentId, referralPhone' },
        { status: 400 },
      );
    }

    const db = getAdminFirestore();

    // Normalize phone number — strip non-digits, ensure +1 prefix
    let normalizedPhone = referralPhone.replace(/[^0-9+]/g, '');
    if (!normalizedPhone.startsWith('+')) {
      if (normalizedPhone.startsWith('1') && normalizedPhone.length === 11) {
        normalizedPhone = '+' + normalizedPhone;
      } else if (normalizedPhone.length === 10) {
        normalizedPhone = '+1' + normalizedPhone;
      }
    }

    const referralData = {
      referralName: referralName || 'Friend',
      referralPhone: normalizedPhone,
      clientName: clientName || 'A client',
      clientId: clientId || null,
      status: 'pending',
      conversation: [],
      gatheredInfo: {},
      appointmentBooked: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const referralRef = await db
      .collection('agents')
      .doc(agentId)
      .collection('referrals')
      .add(referralData);

    return NextResponse.json({
      success: true,
      referralId: referralRef.id,
    });
  } catch (error) {
    console.error('Error creating referral record:', error);
    return NextResponse.json(
      { error: 'Failed to create referral record' },
      { status: 500 },
    );
  }
}
