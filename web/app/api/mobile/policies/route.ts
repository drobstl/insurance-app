import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';

/**
 * GET /api/mobile/policies?agentId=...&clientId=...&clientCode=...
 *
 * Public endpoint for the mobile app. Authenticates via clientCode
 * (validated against the client document) instead of Firebase Auth.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const agentId = searchParams.get('agentId');
    const clientId = searchParams.get('clientId');
    const clientCode = searchParams.get('clientCode');

    if (!agentId || !clientId || !clientCode) {
      return NextResponse.json(
        { error: 'agentId, clientId, and clientCode are required' },
        { status: 400 },
      );
    }

    const firestore = getAdminFirestore();

    const clientDoc = await firestore
      .collection('agents')
      .doc(agentId)
      .collection('clients')
      .doc(clientId)
      .get();

    if (!clientDoc.exists) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const storedCode = clientDoc.data()?.clientCode;
    if (!storedCode || storedCode !== clientCode.trim().toUpperCase()) {
      return NextResponse.json({ error: 'Invalid client code' }, { status: 403 });
    }

    const snap = await firestore
      .collection('agents')
      .doc(agentId)
      .collection('clients')
      .doc(clientId)
      .collection('policies')
      .orderBy('createdAt', 'desc')
      .get();

    const policies = snap.docs.map((d) => {
      const data = d.data();
      const createdAt = data.createdAt
        ? { seconds: data.createdAt.seconds, nanoseconds: data.createdAt.nanoseconds }
        : null;
      return { id: d.id, ...data, createdAt };
    });

    return NextResponse.json({ policies });
  } catch (error) {
    console.error('[mobile/policies] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch policies' },
      { status: 500 },
    );
  }
}
