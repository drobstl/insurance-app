import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '../../../../../../lib/firebase-admin';
import { cancelBatchJob } from '../../../../../../lib/ingestion-v3-batch-store';
import { getIngestionV3JobsCollection } from '../../../../../../lib/ingestion-v3-store';

interface CancelGoogleDriveImportBody {
  batchId?: string;
}

interface CancelGoogleDriveImportResponse {
  success: boolean;
  cancelled?: boolean;
  status?: string;
  jobsCancelled?: number;
  error?: string;
}

async function requireAgentId(req: NextRequest): Promise<string> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }
  const token = authHeader.split('Bearer ')[1];
  const decoded = await getAdminAuth().verifyIdToken(token);
  return decoded.uid;
}

async function cancelIngestionJob(jobId: string): Promise<boolean> {
  const ref = getIngestionV3JobsCollection().doc(jobId);
  const snap = await ref.get();
  if (!snap.exists) return false;

  const data = snap.data() as Record<string, unknown>;
  const status = (data.status as string | undefined) ?? 'failed';
  if (status === 'review_ready' || status === 'saved' || status === 'failed') {
    return false;
  }

  await ref.set(
    {
      status: 'failed',
      error: {
        code: 'IMPORT_CANCELLED',
        message: 'Import cancelled by user.',
        retryable: false,
        terminal: true,
      },
      processingToken: FieldValue.delete(),
      retryAfter: FieldValue.delete(),
      batchId: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return true;
}

export async function POST(req: NextRequest): Promise<NextResponse<CancelGoogleDriveImportResponse>> {
  try {
    const agentId = await requireAgentId(req);
    const body = (await req.json()) as CancelGoogleDriveImportBody;
    const batchId = (body.batchId || '').trim();
    if (!batchId) {
      return NextResponse.json({ success: false, error: 'batchId is required.' }, { status: 400 });
    }

    const cancellation = await cancelBatchJob(agentId, batchId);
    if (cancellation.status === 'not_found') {
      return NextResponse.json({ success: false, error: 'Import batch not found.' }, { status: 404 });
    }

    if (!cancellation.cancelled) {
      return NextResponse.json({
        success: true,
        cancelled: false,
        status: cancellation.status,
        jobsCancelled: 0,
      });
    }

    const cancellations = await Promise.all(cancellation.cancellableJobIds.map((jobId) => cancelIngestionJob(jobId)));
    const jobsCancelled = cancellations.filter(Boolean).length;

    return NextResponse.json({
      success: true,
      cancelled: true,
      status: 'cancelled',
      jobsCancelled,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to cancel import.';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
