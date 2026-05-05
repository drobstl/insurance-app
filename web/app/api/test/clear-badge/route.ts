import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { sendExpoPush } from '../../../../lib/push-permission-lifecycle';

/**
 * TEST-ONLY: Send a silent push with badge:0 to clear a stuck app icon badge.
 *
 * Usage:
 *   POST /api/test/clear-badge
 *   Body: { "clientName": "John Doe" }
 *     or: { "agentId": "xxx", "clientId": "yyy" }
 */
export async function POST(req: NextRequest) {
  try {
    const { clientName, agentId, clientId } = await req.json();
    const db = getAdminFirestore();

    let pushToken: string | null = null;
    let resolvedName = '';
    let resolvedAgentId: string | null = null;
    let resolvedClientId: string | null = null;
    let resolvedClientRef: FirebaseFirestore.DocumentReference | null = null;

    if (agentId && clientId) {
      const clientDoc = await db.doc(`agents/${agentId}/clients/${clientId}`).get();
      if (!clientDoc.exists) {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 });
      }
      pushToken = (clientDoc.data()?.pushToken as string) || null;
      resolvedName = (clientDoc.data()?.name as string) || clientId;
      resolvedAgentId = agentId;
      resolvedClientId = clientId;
      resolvedClientRef = clientDoc.ref;
    } else if (clientName) {
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
          pushToken = (clientsSnap.docs[0].data().pushToken as string) || null;
          resolvedName = clientName;
          resolvedAgentId = agentDoc.id;
          resolvedClientId = clientsSnap.docs[0].id;
          resolvedClientRef = clientsSnap.docs[0].ref;
          break;
        }
      }
    } else {
      return NextResponse.json(
        { error: 'Provide either clientName or agentId+clientId' },
        { status: 400 },
      );
    }

    if (!pushToken || !resolvedClientRef || !resolvedAgentId || !resolvedClientId) {
      return NextResponse.json(
        { error: `No push token found for "${resolvedName}"` },
        { status: 422 },
      );
    }

    const outcome = await sendExpoPush(
      {
        to: pushToken,
        badge: 0,
        priority: 'high',
        _contentAvailable: true,
      },
      {
        ref: resolvedClientRef,
        agentId: resolvedAgentId,
        clientId: resolvedClientId,
      },
    );

    return NextResponse.json({
      success: outcome.status === 'ok',
      client: resolvedName,
      outcome,
    });
  } catch (error) {
    console.error('clear-badge error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
