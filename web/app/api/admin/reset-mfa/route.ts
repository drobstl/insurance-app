import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { getAdminAuth } from '../../../../lib/firebase-admin';
import { isAdminEmail } from '../../../../lib/admin';

/**
 * POST /api/admin/reset-mfa  { uid?: string, email?: string }
 *
 * Admin-only recovery path: clears all enrolled MFA factors for an agent so
 * a locked-out user (lost phone) can sign in again. Firebase phone MFA has
 * no self-service backup codes, so admin reset is the recovery mechanism.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = await getAdminAuth().verifyIdToken(authHeader.slice('Bearer '.length).trim());
    if (!isAdminEmail(decoded.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as { uid?: unknown; email?: unknown } | null;
    const adminAuth = getAdminAuth();

    let uid = typeof body?.uid === 'string' ? body.uid.trim() : '';
    if (!uid && typeof body?.email === 'string' && body.email.trim()) {
      const u = await adminAuth.getUserByEmail(body.email.trim().toLowerCase());
      uid = u.uid;
    }
    if (!uid) {
      return NextResponse.json({ error: 'uid or email required' }, { status: 400 });
    }

    await adminAuth.updateUser(uid, { multiFactor: { enrolledFactors: null } });
    console.log('[admin/reset-mfa] cleared MFA', { adminEmail: decoded.email, targetUid: uid });

    return NextResponse.json({ success: true, uid });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Firebase ID token')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[admin/reset-mfa] failed', { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
