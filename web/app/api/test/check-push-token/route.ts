import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';

/**
 * TEST-ONLY: Inspect a client's push token status in Firestore.
 *
 * Usage:
 *   GET /api/test/check-push-token?clientName=John+Doe
 *   GET /api/test/check-push-token?agentId=xxx&clientId=yyy
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const clientName = searchParams.get('clientName');
  const agentId = searchParams.get('agentId');
  const clientId = searchParams.get('clientId');

  try {
    const db = getAdminFirestore();

    if (agentId && clientId) {
      const clientDoc = await db.doc(`agents/${agentId}/clients/${clientId}`).get();
      if (!clientDoc.exists) {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 });
      }
      const data = clientDoc.data()!;
      return NextResponse.json({
        agentId,
        clientId,
        clientName: data.name || '(no name)',
        pushToken: data.pushToken ?? null,
        pushTokenType: data.pushToken === undefined ? 'undefined (field missing)' : typeof data.pushToken,
        clientCode: data.clientCode || null,
      });
    }

    if (clientName) {
      const agentsSnap = await db.collection('agents').get();
      for (const agentDoc of agentsSnap.docs) {
        const clientsSnap = await db
          .collection('agents')
          .doc(agentDoc.id)
          .collection('clients')
          .where('name', '==', clientName)
          .limit(1)
          .get();

        if (!clientsSnap.empty) {
          const cDoc = clientsSnap.docs[0];
          const data = cDoc.data();
          return NextResponse.json({
            agentId: agentDoc.id,
            agentName: agentDoc.data().name || '(no name)',
            clientId: cDoc.id,
            clientName: data.name,
            pushToken: data.pushToken ?? null,
            pushTokenType: data.pushToken === undefined ? 'undefined (field missing)' : typeof data.pushToken,
            clientCode: data.clientCode || null,
            phone: data.phone || null,
          });
        }
      }
      return NextResponse.json({ error: `Client "${clientName}" not found` }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Provide either clientName or agentId+clientId query params' },
      { status: 400 },
    );
  } catch (error) {
    console.error('check-push-token error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
