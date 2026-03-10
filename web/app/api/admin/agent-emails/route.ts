import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { isAdminEmail } from '../../../../lib/admin';

/**
 * GET /api/admin/agent-emails
 *
 * Returns all emails of people who signed up (agents) or came through the
 * founding member application flow. Merged and deduplicated by email.
 * Requires admin: Bearer <Firebase ID token> and caller in NEXT_PUBLIC_ADMIN_EMAILS.
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

    // Signups: agents collection
    const agentsSnap = await firestore.collection('agents').get();
    const byEmail = new Map<
      string,
      { email: string; name: string | null; sources: string[]; signedUpAt: string | null; appliedAt: string | null }
    >();

    for (const doc of agentsSnap.docs) {
      const data = doc.data();
      const email = (data.email as string)?.trim?.();
      if (!email || typeof email !== 'string') continue;
      const key = email.toLowerCase();
      const createdAt = data.createdAt?.toDate?.()?.toISOString?.() ?? null;
      byEmail.set(key, {
        email,
        name: (data.name as string) || null,
        sources: ['signup'],
        signedUpAt: createdAt,
        appliedAt: null,
      });
    }

    // Founding member applications (merge in; dedupe by email)
    const applicationsSnap = await firestore
      .collection('foundingMemberApplications')
      .orderBy('timestamp', 'desc')
      .get();

    for (const doc of applicationsSnap.docs) {
      const data = doc.data();
      const email = (data.email as string)?.trim?.();
      if (!email || typeof email !== 'string') continue;
      const key = email.toLowerCase();
      const appliedAt = data.timestamp?.toDate?.()?.toISOString?.() ?? null;
      const name = (data.name as string) || null;

      if (byEmail.has(key)) {
        const row = byEmail.get(key)!;
        if (!row.sources.includes('founding_application')) row.sources.push('founding_application');
        if (appliedAt && !row.appliedAt) row.appliedAt = appliedAt;
        if (name && !row.name) row.name = name;
      } else {
        byEmail.set(key, {
          email,
          name,
          sources: ['founding_application'],
          signedUpAt: null,
          appliedAt,
        });
      }
    }

    const list = Array.from(byEmail.values()).sort((a, b) =>
      (a.signedUpAt || a.appliedAt || '').localeCompare(b.signedUpAt || b.appliedAt || '')
    ).reverse();

    const emails = list.map((r) => r.email);

    return NextResponse.json({
      emails,
      count: emails.length,
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
