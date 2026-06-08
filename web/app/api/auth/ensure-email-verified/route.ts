import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { getAdminAuth } from '../../../../lib/firebase-admin';

/**
 * POST /api/auth/ensure-email-verified
 *
 * Marks the CALLER'S OWN email as verified so they can enroll a phone as a
 * second factor. Firebase phone MFA enrollment hard-requires
 * `emailVerified === true`; AFL creates accounts with it false and never runs
 * an email round-trip, which would otherwise force a "check your inbox" step
 * in front of MFA setup.
 *
 * This is safe and self-scoped: the uid comes from the caller's verified ID
 * token, so a user can only ever verify their OWN email, and they have already
 * proven account control by signing in with their password. The action only
 * lets them ADD a second factor (it strengthens the account, never weakens
 * it). Nothing in the app gates access on `emailVerified` — it is only ever
 * set at signup — so flipping it true has no other side effects.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(authHeader.slice('Bearer '.length).trim());

    const user = await adminAuth.getUser(decoded.uid);
    if (!user.emailVerified) {
      await adminAuth.updateUser(decoded.uid, { emailVerified: true });
      console.log('[auth/ensure-email-verified] marked verified for MFA enrollment', { uid: decoded.uid });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[auth/ensure-email-verified] failed', { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
