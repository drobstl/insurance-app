import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { isAdminEmail } from '../../../../lib/admin';

/**
 * GET /api/admin/agent-emails
 *
 * Returns all emails of people who have signed up for Agent For Life (AFL).
 * Requires admin: Bearer <Firebase ID token> and caller email in NEXT_PUBLIC_ADMIN_EMAILS.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(token);
    const callerEmail = decoded.email ?? null;

    if (!isAdminEmail(callerEmail)) {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    }

    const firestore = getAdminFirestore();
    const snapshot = await firestore.collection('agents').get();

    const list = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        email: data.email || null,
        name: data.name || null,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
      };
    });

    const emails = list
      .map((r) => r.email)
      .filter((e): e is string => typeof e === 'string' && e.length > 0);

    return NextResponse.json({
      emails,
      count: emails.length,
      // Optional: full list with name and createdAt for export
      list,
    });
  } catch (error) {
    console.error('Error fetching agent emails:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agent emails' },
      { status: 500 }
    );
  }
}
