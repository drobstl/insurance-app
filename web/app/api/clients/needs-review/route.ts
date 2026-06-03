import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';

/**
 * Clients flagged for import review (survivors of the bulk-import merge,
 * stamped `needsImportReview: true`). Powers the /dashboard/clients/
 * import-review worklist.
 *
 *   GET  → { clients: [{ id, name, clientCode, mergedRecords }], count }
 *   POST { clientId } → mark one resolved (clears the flag)
 *
 * Auth: Bearer ID token, scoped to the calling agent.
 */

async function authAgentId(req: NextRequest): Promise<string | null> {
  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  try {
    return (await getAdminAuth().verifyIdToken(token)).uid;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const agentId = await authAgentId(req);
  if (!agentId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const snap = await getAdminFirestore()
    .collection('agents').doc(agentId).collection('clients')
    .where('needsImportReview', '==', true)
    .get();

  const clients = snap.docs.map((d) => {
    const x = d.data();
    const ir = (x.importReview || {}) as { mergedRecords?: number };
    return {
      id: d.id,
      name: typeof x.name === 'string' ? x.name : '',
      clientCode: typeof x.clientCode === 'string' ? x.clientCode : null,
      mergedRecords: typeof ir.mergedRecords === 'number' ? ir.mergedRecords : 0,
    };
  });
  clients.sort((a, b) => b.mergedRecords - a.mergedRecords || a.name.localeCompare(b.name));

  return NextResponse.json({ clients, count: clients.length });
}

export async function POST(req: NextRequest) {
  const agentId = await authAgentId(req);
  if (!agentId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { clientId?: string };
  if (!body.clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 });

  await getAdminFirestore()
    .collection('agents').doc(agentId).collection('clients').doc(body.clientId)
    .set({ needsImportReview: false, importReviewResolvedAt: FieldValue.serverTimestamp() }, { merge: true });

  return NextResponse.json({ ok: true });
}
