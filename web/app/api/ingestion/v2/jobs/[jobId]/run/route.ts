import { NextRequest, NextResponse } from 'next/server';
import { getIngestionJobsCollection, processIngestionJob, toJobResponse } from '../../../../../../../lib/ingestion-v2';

interface RunJobResponse {
  success: boolean;
  job?: ReturnType<typeof toJobResponse>;
  error?: string;
}

export const maxDuration = 120;
const RETRY_POLL_MS = 1000;
const MAX_SERVER_RETRY_WINDOW_MS = 110_000;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<NextResponse<RunJobResponse>> {
  try {
    const { jobId } = await params;
    const ref = getIngestionJobsCollection().doc(jobId);
    const existing = await ref.get();
    if (!existing.exists) {
      return NextResponse.json({ success: false, error: 'Job not found.' }, { status: 404 });
    }

    const startedAt = Date.now();
    await processIngestionJob(jobId);

    while (Date.now() - startedAt < MAX_SERVER_RETRY_WINDOW_MS) {
      const current = await ref.get();
      const data = current.data() || {};
      const status = data.status as 'queued' | 'processing' | 'succeeded' | 'failed' | undefined;
      if (status === 'succeeded' || status === 'failed') {
        break;
      }

      if (status === 'queued') {
        const retryAfter = typeof data.retryAfter === 'number' ? data.retryAfter : undefined;
        if (retryAfter && Date.now() < retryAfter) {
          await sleep(Math.min(RETRY_POLL_MS, retryAfter - Date.now()));
          continue;
        }
        await processIngestionJob(jobId);
        continue;
      }

      if (status === 'processing') {
        await sleep(RETRY_POLL_MS);
        continue;
      }

      break;
    }

    const updated = await ref.get();
    return NextResponse.json({
      success: true,
      job: toJobResponse(jobId, updated.data() || {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to run ingestion job.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
