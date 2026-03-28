import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decoded = await getAdminAuth().verifyIdToken(token);
    const agentId = decoded.uid;

    const batchId = req.nextUrl.searchParams.get('batchId');

    const db = getAdminFirestore();

    if (batchId) {
      const snap = await db.collection('agents').doc(agentId).collection('batchJobs').doc(batchId).get();
      if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ id: snap.id, ...snap.data() });
    }

    // Return most recent batch
    const snaps = await db
      .collection('agents')
      .doc(agentId)
      .collection('batchJobs')
      .orderBy('createdAt', 'desc')
      .limit(3)
      .get();

    const batches = snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ batches });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
