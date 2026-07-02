import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '../../../../lib/firebase-admin';
import { isAdminEmail } from '../../../../lib/admin';
import { seedDemoDownline, purgeDemoDownline } from '../../../../lib/demo-downline';

/**
 * POST /api/admin/demo-downline
 *
 * Seed or purge the TEMPORARY fake demo downline under the CALLER's own
 * account (see lib/demo-downline). Used to stage the My Team screen for a
 * live pitch, then wipe it right after. The demo agents attach to the
 * caller's uid only — this route cannot touch another owner's team.
 *
 * Body: { action: 'seed' | 'purge' }
 * Auth: Bearer <Firebase ID token> (must be an admin email)
 */

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const match = authHeader.match(/^Bearer (.+)$/i);
    if (!match) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    let uid: string;
    let email: string | undefined;
    try {
      const decoded = await getAdminAuth().verifyIdToken(match[1]);
      uid = decoded.uid;
      email = decoded.email;
    } catch {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (!isAdminEmail(email)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as { action?: unknown };
    const action = body.action === 'seed' || body.action === 'purge' ? body.action : null;
    if (!action) return NextResponse.json({ error: 'invalid_action' }, { status: 400 });

    if (action === 'seed') {
      const result = await seedDemoDownline(uid);
      return NextResponse.json({ ok: true, action, ...result });
    }
    const result = await purgeDemoDownline(uid);
    return NextResponse.json({ ok: true, action, ...result });
  } catch (error) {
    console.error('[admin/demo-downline] error', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
