import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { isAdminEmail } from '../../../../lib/admin';

/**
 * POST /api/admin/reset-onboarding
 * Body: { email: string }
 * Resets onboarding state for the given agent email so they see the
 * first-time tutorial again. Caller must be an admin (Bearer token).
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(token);
    const callerEmail = decoded.email as string | undefined;

    if (!isAdminEmail(callerEmail)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email) {
      return NextResponse.json({ error: 'Missing email' }, { status: 400 });
    }

    const firestore = getAdminFirestore();
    const snapshot = await firestore
      .collection('agents')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ error: 'Agent not found for that email' }, { status: 404 });
    }

    const agentRef = snapshot.docs[0].ref;
    await agentRef.update({
      onboardingComplete: FieldValue.delete(),
      onboarding: FieldValue.delete(),
      tipsSeen: {},
    });

    return NextResponse.json({ ok: true, message: 'Onboarding reset. Have the agent refresh the dashboard.' });
  } catch (error) {
    console.error('Reset onboarding error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reset onboarding' },
      { status: 500 }
    );
  }
}
