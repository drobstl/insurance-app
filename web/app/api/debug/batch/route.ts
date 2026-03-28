import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';

const DEBUG_SECRET = 'batch-debug-temp-2024';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const secret = req.nextUrl.searchParams.get('secret');
    if (secret !== DEBUG_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getAdminFirestore();
    const batchId = req.nextUrl.searchParams.get('batchId');
    const agentId = req.nextUrl.searchParams.get('agentId');

    // If agentId + batchId provided, fetch directly
    if (agentId && batchId) {
      const snap = await db.collection('agents').doc(agentId).collection('batchJobs').doc(batchId).get();
      if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ id: snap.id, ...snap.data() });
    }

    // Otherwise, scan all agents for recent batch jobs
    const agentDocs = await db.collection('agents').listDocuments();
    const results: Record<string, unknown>[] = [];

    for (const agentRef of agentDocs.slice(0, 10)) {
      const snaps = await db
        .collection('agents')
        .doc(agentRef.id)
        .collection('batchJobs')
        .orderBy('createdAt', 'desc')
        .limit(3)
        .get();

      for (const d of snaps.docs) {
        results.push({ agentId: agentRef.id, id: d.id, ...d.data() });
      }
    }

    return NextResponse.json({ batches: results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
