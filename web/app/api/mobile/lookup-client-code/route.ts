import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';

/**
 * POST /api/mobile/lookup-client-code
 *
 * Public endpoint for the mobile app. Looks up a client by client code using
 * the Admin SDK (bypasses Firestore rules). Returns client + agent data so the
 * app can sign in without reading Firestore directly.
 *
 * Body: { clientCode: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const clientCode = typeof body?.clientCode === 'string' ? body.clientCode : '';

    if (!clientCode.trim()) {
      return NextResponse.json({ error: 'Missing or invalid clientCode' }, { status: 400 });
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
        const clientData = clientDoc.data();
        const agentData = agentDoc.data();

        return NextResponse.json({
          agentId: agentDoc.id,
          clientId: clientDoc.id,
          clientData: {
            name: clientData.name ?? '',
            email: clientData.email ?? '',
            phone: clientData.phone ?? '',
            clientCode: clientData.clientCode ?? normalizedCode,
          },
          agentData: {
            name: agentData.name ?? 'Your Agent',
            email: agentData.email ?? '',
            phoneNumber: agentData.phoneNumber ?? '',
            agencyName: agentData.agencyName ?? '',
            referralMessage: agentData.referralMessage ?? '',
            photoBase64: agentData.photoBase64 ?? '',
            agencyLogoBase64: agentData.agencyLogoBase64 ?? '',
            businessCardBase64: agentData.businessCardBase64 ?? '',
          },
        });
      }
    }

    return NextResponse.json({ error: 'Client code not found' }, { status: 404 });
  } catch (error) {
    console.error('lookup-client-code error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
