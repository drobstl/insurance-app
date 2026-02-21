import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';

/**
 * POST /api/push-token/register
 *
 * Called by the mobile app after obtaining an Expo push token.
 * Writes the token to the client document using the Admin SDK,
 * which bypasses Firestore security rules entirely.
 *
 * Body: { clientCode: string, pushToken: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { clientCode, pushToken } = await req.json();

    if (!clientCode || typeof clientCode !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid clientCode' }, { status: 400 });
    }
    if (!pushToken || typeof pushToken !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid pushToken' }, { status: 400 });
    }

    const normalizedCode = clientCode.trim().toUpperCase();

    const db = getAdminFirestore();
    const agentsSnap = await db.collection('agents').get();

    for (const agentDoc of agentsSnap.docs) {
      const clientsSnap = await db
        .collection('agents')
        .doc(agentDoc.id)
        .collection('clients')
        .where('clientCode', '==', normalizedCode)
        .limit(1)
        .get();

      if (!clientsSnap.empty) {
        const clientDoc = clientsSnap.docs[0];
        await clientDoc.ref.update({ pushToken });

        return NextResponse.json({
          success: true,
          agentId: agentDoc.id,
          clientId: clientDoc.id,
        });
      }
    }

    return NextResponse.json({ error: 'Client code not found' }, { status: 404 });
  } catch (error) {
    console.error('push-token/register error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
