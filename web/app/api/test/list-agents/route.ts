import 'server-only';

import { NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';

/**
 * TEST-ONLY: Lists agents and their first few clients so you can grab IDs
 * for the seed-notifications endpoint.
 *
 * Usage: GET /api/test/list-agents
 *
 * ⚠️  Remove before production.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  const db = getAdminFirestore();
  const agentsSnap = await db.collection('agents').get();

  const agents = [];

  for (const agentDoc of agentsSnap.docs) {
    const agentData = agentDoc.data();

    const clientsSnap = await db
      .collection('agents')
      .doc(agentDoc.id)
      .collection('clients')
      .limit(5)
      .get();

    const clients = clientsSnap.docs.map((c) => ({
      clientId: c.id,
      name: c.data().name || '(no name)',
    }));

    agents.push({
      agentId: agentDoc.id,
      name: agentData.name || '(no name)',
      email: agentData.email || '(no email)',
      clients,
    });
  }

  return NextResponse.json({ agents });
}
