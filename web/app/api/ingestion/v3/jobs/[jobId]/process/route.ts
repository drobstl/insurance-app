import { NextRequest, NextResponse } from 'next/server';
import { deriveWebhookSecret } from '../../../../../../../lib/cloud-tasks';
import { processIngestionV3Job } from '../../../../../../../lib/ingestion-v3-processor';
import { getIngestionV3Job } from '../../../../../../../lib/ingestion-v3-store';
import { trackIngestionV3ProcessAuthFailed } from '../../../../../../../lib/ingestion-v3-telemetry';

export const maxDuration = 120;

interface ProcessJobResponse {
  success: boolean;
  jobId?: string;
  status?: string;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    terminal: boolean;
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<NextResponse<ProcessJobResponse>> {
  const authResult = verifyWebhookSecret(req);
  if (!authResult.ok) {
    trackIngestionV3ProcessAuthFailed({ message: authResult.message });
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'TASK_AUTH_INVALID',
          message: authResult.message,
          retryable: false,
          terminal: true,
        },
      },
      { status: 401 },
    );
  }

  try {
    const { jobId } = await params;
    const processingResult = await processIngestionV3Job(jobId);
    if (processingResult.status === 'skipped' && processingResult.reason === 'not_found') {
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
      jobId,
      status: job.status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process ingestion v3 job.';
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

function verifyWebhookSecret(req: NextRequest): { ok: true } | { ok: false; message: string } {
  const secret = req.headers.get('x-cloudtasks-webhook-secret');
  if (!secret) {
    return { ok: false, message: 'Missing webhook secret header.' };
  }

  try {
    const expected = deriveWebhookSecret();
    if (secret !== expected) {
      return { ok: false, message: 'Webhook secret mismatch.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: 'Failed to derive webhook secret for verification.' };
  }
}
