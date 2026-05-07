import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { isAdminEmail } from '../../../../lib/admin';

const SELF_TEST_RESET_EMAIL = 'deardanielroberts@gmail.com';

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
 * Resets onboarding + profile setup state for the given agent email so they
 * see the true first-time onboarding flow again. Caller must be an admin
 * (Bearer token).
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
    const normalizedCallerEmail = callerEmail?.trim().toLowerCase() ?? '';

    const isAllowedSelfTestResetCaller = normalizedCallerEmail === SELF_TEST_RESET_EMAIL;
    if (!isAdminEmail(callerEmail) && !isAllowedSelfTestResetCaller) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const keepProfile = body.keepProfile === true;
    if (!email) {
      return NextResponse.json({ error: 'Missing email' }, { status: 400 });
    }
    if (isAllowedSelfTestResetCaller && email !== normalizedCallerEmail) {
      return NextResponse.json(
        { error: 'You can only reset onboarding for your own account.' },
        { status: 403 },
      );
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
    // Always-reset fields (onboarding state). Profile fields are
    // additionally reset when keepProfile is false (the legacy
    // behavior). Daniel's May 6 testing-window addition: pass
    // keepProfile: true to retest the onboarding flow without
    // having to refill name / agency / phone / photo each cycle.
    const resetPatch: Record<string, unknown> = {
      onboardingComplete: FieldValue.delete(),
      onboarding: FieldValue.delete(),
      tipsSeen: {},
    };
    if (!keepProfile) {
      resetPatch.name = FieldValue.delete();
      resetPatch.agencyName = FieldValue.delete();
      resetPatch.phoneNumber = FieldValue.delete();
      resetPatch.photoBase64 = FieldValue.delete();
      resetPatch.photoURL = FieldValue.delete();
      resetPatch.agencyLogoBase64 = FieldValue.delete();
    }
    // Phase 1 Track B — also clear the agent's web push subscriptions
    // so a fresh onboarding cycle re-tests the permission grant +
    // subscribe flow from scratch. Without this, a previously-
    // registered subscription would auto-flip the webPushGranted
    // milestone on next dashboard load (PWAInstaller's auto-detect
    // effect) and the agent would skip past the test.
    resetPatch.webPushSubscriptions = FieldValue.delete();
    resetPatch.webPushPermissionRevokedAt = FieldValue.delete();

    await agentRef.update(resetPatch);

    return NextResponse.json({
      ok: true,
      keepProfile,
      message: keepProfile
        ? 'Onboarding milestones reset. Profile fields preserved. Refresh the dashboard.'
        : 'Onboarding and profile setup reset. Have the agent refresh the dashboard.',
    });
  } catch (error) {
    console.error('Reset onboarding error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reset onboarding' },
      { status: 500 }
    );
  }
}
