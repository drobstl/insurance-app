import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '../../../../../lib/firebase-admin';
import { cancelLeadBatch, getLeadBatch } from '../../../../../lib/leads-batch-store';

export const maxDuration = 30;

/**
 * GET /api/leads/batch/[batchId]
 *
 * Status-poll fallback for the dashboard. The happy path watches the
 * batch doc live via onSnapshot; this exists for clients that can't
 * (or to re-sync after a reconnect).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const agentId = await authAgentId(req);
  if (!agentId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { batchId } = await params;
  const batch = await getLeadBatch(agentId, batchId);
  if (!batch) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  }
  return NextResponse.json({ batch });
}

/**
 * DELETE /api/leads/batch/[batchId]
 *
 * Cancels an in-flight batch. Pages already committed stay as leads;
 * the processor stops before the next chunk once it sees the cancel.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const agentId = await authAgentId(req);
  if (!agentId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { batchId } = await params;
  const result = await cancelLeadBatch(agentId, batchId);
  if (result.status === 'not_found') {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  }
  return NextResponse.json({ cancelled: result.cancelled, status: result.status });
}

async function authAgentId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}
