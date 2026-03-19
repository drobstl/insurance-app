import { NextRequest, NextResponse } from 'next/server';
import { getIngestionJobsCollection, processIngestionJob, toJobResponse } from '../../../../../../../lib/ingestion-v2';

interface RunJobResponse {
  success: boolean;
  job?: ReturnType<typeof toJobResponse>;
  error?: string;
}

export const maxDuration = 120;

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

    await processIngestionJob(jobId);

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
