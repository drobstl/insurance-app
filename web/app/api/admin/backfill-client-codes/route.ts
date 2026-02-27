import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '../../../../lib/firebase-admin';
import { getAdminFirestore } from '../../../../lib/firebase-admin';

/**
 * POST /api/admin/backfill-client-codes
 *
 * One-time admin endpoint that scans all agents/clients and creates a
 * top-level `clientCodes` index document for each client code.
 *
 * Document ID = the code (uppercase), contents = { agentId, clientId }.
 *
 * Requires a valid agent (Firebase Auth) token for basic protection.
 * Idempotent: safe to run multiple times.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    await getAdminAuth().verifyIdToken(token);

    const db = getAdminFirestore();
    const agentsSnap = await db.collection('agents').get();

    let indexed = 0;
    let skipped = 0;

    for (const agentDoc of agentsSnap.docs) {
      const clientsSnap = await db
        .collection('agents')
        .doc(agentDoc.id)
        .collection('clients')
        .get();

      for (const clientDoc of clientsSnap.docs) {
        const code = clientDoc.data().clientCode;
        if (!code || typeof code !== 'string') {
          skipped++;
          continue;
        }

        await db.collection('clientCodes').doc(code.trim().toUpperCase()).set({
          agentId: agentDoc.id,
          clientId: clientDoc.id,
        });
        indexed++;
      }
    }

    return NextResponse.json({ success: true, indexed, skipped });
  } catch (error) {
    console.error('backfill-client-codes error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
