import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { isAdminEmail } from '../../../../lib/admin';

/**
 * POST /api/admin/set-agency-owner
 *
 * Manually designate (or un-designate) an agent as an agency owner — the
 * v1 mechanism for onboarding owners by hand. Admin-only (NEXT_PUBLIC_
 * ADMIN_EMAILS). A self-serve path (e.g. auto-promote once an agent has
 * referred N paying agents) can replace/augment this later.
 *
 * Body: { uid: string, isAgencyOwner: boolean }
 * Auth: Bearer <Firebase ID token> (must be an admin email)
 */

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const match = authHeader.match(/^Bearer (.+)$/i);
    if (!match) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    let email: string | undefined;
    try {
      const decoded = await getAdminAuth().verifyIdToken(match[1]);
      email = decoded.email;
    } catch {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (!isAdminEmail(email)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      uid?: unknown;
      isAgencyOwner?: unknown;
    };
    const targetUid = typeof body.uid === 'string' ? body.uid.trim() : '';
    if (!targetUid) return NextResponse.json({ error: 'missing_uid' }, { status: 400 });
    const value = body.isAgencyOwner === true;

    await getAdminFirestore()
      .collection('agents')
      .doc(targetUid)
      .set({ isAgencyOwner: value }, { merge: true });

    return NextResponse.json({ ok: true, uid: targetUid, isAgencyOwner: value });
  } catch (error) {
    console.error('[admin/set-agency-owner] error', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
