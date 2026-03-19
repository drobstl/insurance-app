import { NextRequest, NextResponse } from 'next/server';
import { getIngestionJobsCollection, toJobResponse } from '../../../../../../lib/ingestion-v2';

interface GetJobResponse {
  success: boolean;
  job?: ReturnType<typeof toJobResponse>;
  error?: string;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<NextResponse<GetJobResponse>> {
  try {
    const { jobId } = await params;
    const ref = getIngestionJobsCollection().doc(jobId);
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json({ success: false, error: 'Job not found.' }, { status: 404 });
    }

    const data = snap.data() || {};
    return NextResponse.json({ success: true, job: toJobResponse(jobId, data) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch job.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
