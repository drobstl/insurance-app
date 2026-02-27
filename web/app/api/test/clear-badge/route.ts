import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';

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

    if (agentId && clientId) {
      const clientDoc = await db.doc(`agents/${agentId}/clients/${clientId}`).get();
      if (!clientDoc.exists) {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 });
      }
      pushToken = (clientDoc.data()?.pushToken as string) || null;
      resolvedName = (clientDoc.data()?.name as string) || clientId;
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
          break;
        }
      }
    } else {
      return NextResponse.json(
        { error: 'Provide either clientName or agentId+clientId' },
        { status: 400 },
      );
    }

    if (!pushToken) {
      return NextResponse.json(
        { error: `No push token found for "${resolvedName}"` },
        { status: 422 },
      );
    }

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        to: pushToken,
        badge: 0,
        priority: 'high',
        _contentAvailable: true,
      }),
    });

    const result = await res.json();
    const ok = result?.data?.status === 'ok';

    return NextResponse.json({
      success: ok,
      client: resolvedName,
      expoResult: result?.data,
    });
  } catch (error) {
    console.error('clear-badge error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
