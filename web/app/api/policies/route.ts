import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../lib/firebase-admin';

const getAuthUser = async (request: NextRequest) => {
  const authHeader = request.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer (.+)$/i);
  if (!match) return null;

  const token = match[1];
  return getAdminAuth().verifyIdToken(token);
};

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clientId = request.nextUrl.searchParams.get('clientId');
    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const policiesSnap = await db
      .collection('agents')
      .doc(authUser.uid)
      .collection('clients')
      .doc(clientId)
      .collection('policies')
      .orderBy('createdAt', 'desc')
      .get();

    const policies = policiesSnap.docs.map((doc) => {
      const data = doc.data();
      const createdAt = data.createdAt;
      return {
        id: doc.id,
        ...data,
        createdAt: createdAt
          ? { seconds: createdAt.seconds, nanoseconds: createdAt.nanoseconds }
          : null,
      };
    });

    return NextResponse.json({ policies });
  } catch (error) {
    console.error('Error fetching policies:', error);
    return NextResponse.json(
      { error: 'Failed to fetch policies' },
      { status: 500 }
    );
  }
}
