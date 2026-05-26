import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { mergeClients } from '../../../../lib/client-merge';

/**
 * POST /api/clients/merge
 *
 * Merges one client doc (duplicate) into another (canonical), moving
 * all associated data. See lib/client-merge.ts for the full mechanics.
 *
 * Body: { canonicalId: string, duplicateId: string, dryRun?: boolean }
 * Auth: Bearer <Firebase ID token>
 *
 * Response (success):
 *   { ok: true, dryRun, journalId, idempotent, counts, contactGapsFilled, duplicateClientCode }
 *
 * Response (failure):
 *   { ok: false, reason, detail? }
 *
 * Status codes:
 *   200 — merge succeeded (or idempotent re-run)
 *   400 — bad input / merge not allowed (canonical-not-found, etc.)
 *   401 — missing/invalid auth
 *   500 — server error
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
    const canonicalId = typeof body?.canonicalId === 'string' ? body.canonicalId.trim() : '';
    const duplicateId = typeof body?.duplicateId === 'string' ? body.duplicateId.trim() : '';
    const dryRun = Boolean(body?.dryRun);

    if (!canonicalId || !duplicateId) {
      return NextResponse.json(
        { error: 'canonicalId and duplicateId are required' },
        { status: 400 },
      );
    }

    const db = getAdminFirestore();
    const result = await mergeClients(db, agentId, canonicalId, duplicateId, {
      dryRun,
      actorAgentId: agentId,
    });

    if (!result.ok) {
      // Treat business-logic failures (canonical not found, etc.) as 400.
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('Client merge error:', error);
    if (error instanceof Error && error.message.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to merge clients' }, { status: 500 });
  }
}
