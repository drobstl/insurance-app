import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';

/**
 * Manually inject a push token onto a client's Firestore document.
 *
 * Usage:
 *   POST /api/test/set-push-token
 *   Body: { "clientName": "John Doe", "pushToken": "ExponentPushToken[xxx]" }
 *
 *   OR with explicit IDs:
 *   Body: { "agentId": "xxx", "clientId": "yyy", "pushToken": "ExponentPushToken[xxx]" }
 */
export async function POST(req: NextRequest) {
  try {
    const { clientName, agentId, clientId, pushToken } = await req.json();

    if (!pushToken || typeof pushToken !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid pushToken' }, { status: 400 });
    }

    const db = getAdminFirestore();

    if (agentId && clientId) {
      const clientRef = db.doc(`agents/${agentId}/clients/${clientId}`);
      const clientDoc = await clientRef.get();
      if (!clientDoc.exists) {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 });
      }
      await clientRef.update({ pushToken });
      return NextResponse.json({
        success: true,
        agentId,
        clientId,
        clientName: clientDoc.data()!.name || '(no name)',
        pushToken,
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
          await cDoc.ref.update({ pushToken });
          return NextResponse.json({
            success: true,
            agentId: agentDoc.id,
            clientId: cDoc.id,
            clientName: cDoc.data().name,
            pushToken,
          });
        }
      }
      return NextResponse.json({ error: `Client "${clientName}" not found` }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Provide either clientName or agentId+clientId, plus pushToken' },
      { status: 400 },
    );
  } catch (error) {
    console.error('set-push-token error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
