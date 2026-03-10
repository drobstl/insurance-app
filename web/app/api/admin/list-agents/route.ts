import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { isAdminEmail } from '../../../../lib/admin';

/**
 * GET /api/admin/list-agents
 *
 * Returns all agents with their ID, name, email, client count, and
 * subscription status. Used by the Manage Agents admin page.
 *
 * Caller must be an admin (Bearer token + NEXT_PUBLIC_ADMIN_EMAILS).
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decoded = await getAdminAuth().verifyIdToken(token);

    if (!isAdminEmail(decoded.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const firestore = getAdminFirestore();
    const agentsSnap = await firestore.collection('agents').get();

    const agents = await Promise.all(
      agentsSnap.docs.map(async (doc) => {
        const data = doc.data();
        const clientsSnap = await doc.ref.collection('clients').count().get();

        return {
          id: doc.id,
          name: (data.name as string) || '—',
          email: (data.email as string) || '—',
          clientCount: clientsSnap.data().count,
          subscriptionStatus: (data.subscriptionStatus as string) || '—',
        };
      })
    );

    return NextResponse.json({ agents });
  } catch (error) {
    console.error('List agents error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list agents' },
      { status: 500 }
    );
  }
}
