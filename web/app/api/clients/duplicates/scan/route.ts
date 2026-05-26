import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../../lib/firebase-admin';
import { findDuplicateCandidates } from '../../../../../lib/client-dedup';

/**
 * POST /api/clients/duplicates/scan
 *
 * Runs the duplicate-candidate scanner over the authenticated agent's
 * client list and returns groups, sorted highest-confidence first.
 *
 * Body: (none)
 * Auth: Bearer <Firebase ID token>
 *
 * Response: { groups: DuplicateGroup[] }
 *
 * Notes:
 *   - The scan reads every active client + a count of each client's
 *     policies. For agents with very large books (>2000 clients) this
 *     may take a few seconds. Front-end shows a spinner.
 *   - This is a POST not a GET because some agents will scan
 *     repeatedly during cleanup and we don't want intermediate proxies
 *     caching the response.
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

    const db = getAdminFirestore();
    const groups = await findDuplicateCandidates(db, agentId);

    // Serialize Firestore Timestamp instances on createdAt so the
    // response is plain JSON the client can consume directly.
    const serialized = groups.map((g) => ({
      ...g,
      members: g.members.map((m) => ({
        ...m,
        createdAt:
          m.createdAt && typeof (m.createdAt as { toMillis?: () => number }).toMillis === 'function'
            ? (m.createdAt as { toMillis: () => number }).toMillis()
            : null,
      })),
    }));

    return NextResponse.json({ groups: serialized });
  } catch (error) {
    console.error('Duplicate scan error:', error);
    if (error instanceof Error && error.message.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to scan for duplicates' }, { status: 500 });
  }
}
