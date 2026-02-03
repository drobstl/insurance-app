import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '../../../../lib/stripe';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../../firebase';
import { getAdminAuth } from '../../../../lib/firebase-admin';

const getAuthUser = async (request: NextRequest) => {
  const authHeader = request.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer (.+)$/i);
  if (!match) return null;

  const token = match[1];
  return getAdminAuth().verifyIdToken(token);
};

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);

    if (!authUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get the agent's Stripe customer ID from Firestore
    const agentDoc = await getDoc(doc(db, 'agents', authUser.uid));

    if (!agentDoc.exists()) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    const agentData = agentDoc.data();
    const stripeCustomerId = agentData.stripeCustomerId;

    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: 'No subscription found' },
        { status: 400 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Create customer portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${appUrl}/dashboard`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Error creating portal session:', error);
    return NextResponse.json(
      { error: 'Failed to create portal session' },
      { status: 500 }
    );
  }
}
