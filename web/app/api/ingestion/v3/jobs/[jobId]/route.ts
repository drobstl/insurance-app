import { NextRequest, NextResponse } from 'next/server';
import { getIngestionV3Job } from '../../../../../../../lib/ingestion-v3-store';
import type { IngestionV3JobStatusResponse } from '../../../../../../../lib/types';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<NextResponse<IngestionV3JobStatusResponse>> {
  try {
    const { jobId } = await params;
    const job = await getIngestionV3Job(jobId);
    if (!job) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'JOB_NOT_FOUND',
            message: 'Job not found.',
            retryable: false,
            terminal: true,
          },
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      job,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch ingestion v3 job.';
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message,
          retryable: true,
          terminal: false,
        },
      },
      { status: 500 },
    );
  }
}
