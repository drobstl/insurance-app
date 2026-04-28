import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';

interface QueueCounts {
  dueQueued: number;
  failed: number;
  totalNeedsAttention: number;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decoded = await getAdminAuth().verifyIdToken(token);
    const uid = decoded.uid;
    const nowIso = new Date().toISOString();

    const db = getAdminFirestore();
    const beneficiaryCodeToClient = new Map<string, string>();
    const codeSnap = await db.collection('beneficiaryCodes').where('agentId', '==', uid).get();
    codeSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const code = docSnap.id.trim().toUpperCase();
      const clientId = typeof data.clientId === 'string' ? data.clientId : '';
      if (clientId) beneficiaryCodeToClient.set(code, clientId);
    });

    const statusSnap = await db
      .collection('agents')
      .doc(uid)
      .collection('beneficiaryFollowups')
      .where('status', 'in', ['queued', 'failed'])
      .get();

    const byClient: Record<string, QueueCounts> = {};

    statusSnap.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, unknown>;
      const status = typeof data.status === 'string' ? data.status : '';
      const code = typeof data.beneficiaryCode === 'string' ? data.beneficiaryCode.trim().toUpperCase() : '';
      const clientId = code ? beneficiaryCodeToClient.get(code) : null;
      if (!clientId) return;
      if (!byClient[clientId]) {
        byClient[clientId] = { dueQueued: 0, failed: 0, totalNeedsAttention: 0 };
      }

      if (status === 'failed') {
        byClient[clientId].failed += 1;
        byClient[clientId].totalNeedsAttention += 1;
        return;
      }

      if (status === 'queued') {
        const sendAt = typeof data.sendAt === 'string' ? data.sendAt : '';
        if (!sendAt || sendAt <= nowIso) {
          byClient[clientId].dueQueued += 1;
          byClient[clientId].totalNeedsAttention += 1;
        }
      }
    });

    const clientsWithAttention = Object.keys(byClient).length;
    const totalNeedsAttention = Object.values(byClient).reduce((sum, row) => sum + row.totalNeedsAttention, 0);
    const totalFailed = Object.values(byClient).reduce((sum, row) => sum + row.failed, 0);
    const totalDueQueued = Object.values(byClient).reduce((sum, row) => sum + row.dueQueued, 0);

    return NextResponse.json({
      success: true,
      totalNeedsAttention,
      totalDueQueued,
      totalFailed,
      clientsWithAttention,
      byClient,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to load beneficiary queue summary.';
    if (msg.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
