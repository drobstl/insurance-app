import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { findExistingClient } from '../../../../lib/client-dedup';

/**
 * POST /api/clients/find-existing
 *
 * Pre-create duplicate check. Called by every client-creation path
 * (PDF parse, manual add, lead convert, CSV import) BEFORE writing a
 * new client doc — if a match is found, the UI can prompt the agent
 * to attach the new policy to the existing record instead.
 *
 * Body: { name, dateOfBirth?, phone?, email? }
 * Auth: Bearer <Firebase ID token>
 *
 * Response (match found):
 *   {
 *     match: {
 *       clientId, clientName, clientCode,
 *       bucket, confidence, reason,
 *       dateOfBirth, phone, email
 *     }
 *   }
 *
 * Response (no match):
 *   { match: null }
 *
 * The matcher returns the BEST single match (highest bucket); if the
 * agent wants to attach to a different existing client they can do
 * that manually via the client list. v1 surfaces one option.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decoded = await getAdminAuth().verifyIdToken(token);
    const agentId = decoded.uid;

    const body = await req.json();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const dateOfBirth = typeof body?.dateOfBirth === 'string' ? body.dateOfBirth.trim() : '';
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim() : '';

    if (!name) {
      // Without a name we can't run the matcher at all. Return no match
      // rather than 400 — the UI may be calling this on partially-typed
      // input (manual add as-they-type).
      return NextResponse.json({ match: null });
    }

    const db = getAdminFirestore();
    const match = await findExistingClient(db, agentId, {
      name, dateOfBirth, phone, email,
    });

    if (!match) {
      return NextResponse.json({ match: null });
    }

    // Hydrate the response with the existing client's name/code/contact
    // so the UI can render a useful prompt without a second round-trip.
    const existingSnap = await db
      .collection('agents').doc(agentId)
      .collection('clients').doc(match.clientId)
      .get();
    const existing = existingSnap.exists ? existingSnap.data() : null;

    return NextResponse.json({
      match: {
        clientId: match.clientId,
        clientName: existing?.name ?? '',
        clientCode: existing?.clientCode ?? null,
        bucket: match.match.bucket,
        confidence: match.match.confidence,
        reason: match.match.reason,
        dateOfBirth: existing?.dateOfBirth ?? null,
        phone: existing?.phone ?? null,
        email: existing?.email ?? null,
      },
    });
  } catch (error) {
    console.error('find-existing error:', error);
    if (error instanceof Error && error.message.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to check for existing client' }, { status: 500 });
  }
}
