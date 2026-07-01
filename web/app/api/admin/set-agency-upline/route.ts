import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { isAdminEmail } from '../../../../lib/admin';

/**
 * POST /api/admin/set-agency-upline
 *
 * Assign (or clear) a given agent's agency upline — the v1.1 mechanism for
 * attaching EXISTING agents to a team owner by hand. This sets the agent's
 * dedicated `agencyOwnerId` field, which is what getDownlineMembers() queries
 * on. It is intentionally SEPARATE from `referredByAgent` (referral/affiliate
 * credit) so commissions and team structure never get entangled.
 *
 * Modeled on /api/admin/set-agency-owner (Bearer token + NEXT_PUBLIC_
 * ADMIN_EMAILS). The owner side (isAgencyOwner) is set by that route; this
 * route sets the member side (agencyOwnerId).
 *
 * Body: { uid: string, agencyOwnerId: string | null }
 *   - agencyOwnerId = the owner's uid to attach this agent to, or
 *     null/'' to detach (remove the field).
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
      agencyOwnerId?: unknown;
    };
    const targetUid = typeof body.uid === 'string' ? body.uid.trim() : '';
    if (!targetUid) return NextResponse.json({ error: 'missing_uid' }, { status: 400 });

    const ownerId =
      typeof body.agencyOwnerId === 'string' && body.agencyOwnerId.trim().length > 0
        ? body.agencyOwnerId.trim()
        : null;

    // Guard against attaching an agent to itself (would create a self-loop in
    // the team rollup, double-counting the owner's own pen).
    if (ownerId && ownerId === targetUid) {
      return NextResponse.json({ error: 'cannot_assign_self' }, { status: 400 });
    }

    await getAdminFirestore()
      .collection('agents')
      .doc(targetUid)
      .set(
        { agencyOwnerId: ownerId ?? FieldValue.delete() },
        { merge: true },
      );

    return NextResponse.json({ ok: true, uid: targetUid, agencyOwnerId: ownerId });
  } catch (error) {
    console.error('[admin/set-agency-upline] error', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
