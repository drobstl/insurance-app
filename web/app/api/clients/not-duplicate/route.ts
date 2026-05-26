import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { markNotDuplicate } from '../../../../lib/client-merge';

/**
 * POST /api/clients/not-duplicate
 *
 * Records that two clients are NOT duplicates so the duplicate scanner
 * doesn't surface them again. Symmetric — appends each id to the
 * other's `notDuplicateOf` array.
 *
 * Body: { clientIdA: string, clientIdB: string }
 * Auth: Bearer <Firebase ID token>
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decoded = await getAdminAuth().verifyIdToken(token);
    const agentId = decoded.uid;

    const body = await req.json();
    const clientIdA = typeof body?.clientIdA === 'string' ? body.clientIdA.trim() : '';
    const clientIdB = typeof body?.clientIdB === 'string' ? body.clientIdB.trim() : '';

    if (!clientIdA || !clientIdB) {
      return NextResponse.json(
        { error: 'clientIdA and clientIdB are required' },
        { status: 400 },
      );
    }
    if (clientIdA === clientIdB) {
      return NextResponse.json({ error: 'clientIdA and clientIdB must differ' }, { status: 400 });
    }

    const db = getAdminFirestore();
    await markNotDuplicate(db, agentId, clientIdA, clientIdB);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Mark not-duplicate error:', error);
    if (error instanceof Error && error.message.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to mark as not a duplicate' }, { status: 500 });
  }
}
