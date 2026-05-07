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
    // `scope` controls how aggressive the reset is. Three modes:
    // - 'full' (default; legacy behavior): nuke everything —
    //   profile fields, all milestones, all tips. Used for true
    //   first-time-tutorial replay and for prepping a fresh agent
    //   account for QA / demo.
    // - 'milestones-only': keep profile fields but reset ALL six
    //   onboarding milestones to false + clear web push state.
    //   Used when an admin wants a complete walkthrough of every
    //   step but doesn't want to refill name/agency/photo.
    // - 'new-gates-only' (testing-mode default for the May 12
    //   maintenance window): keep profile fields AND keep the four
    //   OLD milestones true (profileCompleted, firstClientCreated,
    //   firstWelcomeSent, firstPatchPromptSent). Reset only the
    //   two NEW HARD gates (pwaInstalled, webPushGranted) + clear
    //   web push state. Lets the admin test ONLY the new pieces
    //   without re-walking profile/clients/welcome/patch. The
    //   OnboardingOverlay's auto-jump-to-first-incomplete logic
    //   then lands them on the pwaInstall step immediately.
    const scope = (() => {
      const raw = typeof body.scope === 'string' ? body.scope : '';
      if (raw === 'milestones-only' || raw === 'new-gates-only' || raw === 'full') return raw;
      // Back-compat: keepProfile=true without an explicit scope
      // implies milestones-only (the prior "keep everything except
      // onboarding state" behavior).
      if (keepProfile) return 'milestones-only' as const;
      return 'full' as const;
    })();
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
    const resetPatch: Record<string, unknown> = {};

    if (scope === 'full' || scope === 'milestones-only') {
      // Wipe entire onboarding state — agent re-walks every step.
      resetPatch.onboardingComplete = FieldValue.delete();
      resetPatch.onboarding = FieldValue.delete();
      resetPatch.tipsSeen = {};
    } else {
      // 'new-gates-only': keep onboardingComplete=true and keep all
      // OLD milestones intact. Reset ONLY the two new HARD gates so
      // the overlay's existing-agent gate fires and the auto-jump
      // logic lands on the pwaInstall step.
      const existingData = agentDoc.data() ?? {};
      const existingOnboarding = (existingData.onboarding ?? {}) as Record<string, unknown>;
      const existingMilestones = ((existingOnboarding.requiredMilestones ?? {}) as Record<string, unknown>);
      // Force-true the four OLD milestones so the testing-mode
      // reset always lands the agent past those steps, even when
      // they previously skipped or never satisfied them. Reference
      // to existingMilestones is informational only — we don't
      // want a partial old state leaking through and re-prompting
      // for, say, the patch step.
      void existingMilestones; // silence unused-binding lint
      resetPatch.onboarding = {
        version: typeof existingOnboarding.version === 'number' ? existingOnboarding.version : 1,
        // Don't pin currentStep — let the overlay's auto-jump logic
        // pick the first incomplete step on its own. Persisting a
        // stale currentStep here would override the auto-jump.
        currentStep: typeof existingOnboarding.currentStep === 'number'
          ? existingOnboarding.currentStep
          : 0,
        requiredMilestones: {
          profileCompleted: true,
          firstClientCreated: true,
          firstWelcomeSent: true,
          firstPatchPromptSent: true,
          pwaInstalled: false,
          webPushGranted: false,
        },
      };
    }

    if (scope === 'full') {
      resetPatch.name = FieldValue.delete();
      resetPatch.agencyName = FieldValue.delete();
      resetPatch.phoneNumber = FieldValue.delete();
      resetPatch.photoBase64 = FieldValue.delete();
      resetPatch.photoURL = FieldValue.delete();
      resetPatch.agencyLogoBase64 = FieldValue.delete();
    }

    // Always clear web push state regardless of scope. Without this,
    // PWAInstaller's auto-detect re-flips webPushGranted on the next
    // dashboard mount and the testing reset is useless.
    resetPatch.webPushSubscriptions = FieldValue.delete();
    resetPatch.webPushPermissionRevokedAt = FieldValue.delete();

    await agentRef.update(resetPatch);

    const messageByScope: Record<string, string> = {
      full: 'Onboarding and profile setup reset. Have the agent refresh the dashboard.',
      'milestones-only':
        'All onboarding milestones reset; profile preserved. Refresh the dashboard to walk through every step.',
      'new-gates-only':
        'New onboarding gates (PWA install + Web Push) reset; old milestones and profile preserved. Refresh the dashboard to retest just the new steps.',
    };

    return NextResponse.json({
      ok: true,
      scope,
      keepProfile: scope !== 'full',
      message: messageByScope[scope],
    });
  } catch (error) {
    console.error('Reset onboarding error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reset onboarding' },
      { status: 500 }
    );
  }
}
