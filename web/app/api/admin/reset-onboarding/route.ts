import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { isAdminEmail } from '../../../../lib/admin';

async function findAgentDocByEmail(
  normalizedEmail: string,
): Promise<QueryDocumentSnapshot | null> {
  const firestore = getAdminFirestore();
  const auth = getAdminAuth();

  const byEmail = await firestore
    .collection('agents')
    .where('email', '==', normalizedEmail)
    .limit(1)
    .get();
  if (!byEmail.empty) {
    return byEmail.docs[0];
  }

  const byEmailLower = await firestore
    .collection('agents')
    .where('emailLower', '==', normalizedEmail)
    .limit(1)
    .get();
  if (!byEmailLower.empty) {
    return byEmailLower.docs[0];
  }

  try {
    const authUser = await auth.getUserByEmail(normalizedEmail);
    const byUid = await firestore.collection('agents').doc(authUser.uid).get();
    if (byUid.exists) {
      return byUid as QueryDocumentSnapshot;
    }
  } catch {
    // Ignore auth miss and continue to null response below.
  }

  return null;
}

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

    const agentDoc = await findAgentDocByEmail(email);
    if (!agentDoc) {
      return NextResponse.json(
        {
          error:
            'Agent not found for that email. If the user can sign in, their profile may be missing an email field; use their exact auth email and try again.',
        },
        { status: 404 },
      );
    }

    const agentRef = agentDoc.ref;
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
