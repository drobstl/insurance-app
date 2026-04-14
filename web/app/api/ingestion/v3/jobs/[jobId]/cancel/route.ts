import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '../../../../../../../lib/firebase-admin';
import { cancelIngestionV3Job, getIngestionV3Job } from '../../../../../../../lib/ingestion-v3-store';
import { INGESTION_V3_ERROR_CODES, type IngestionV3ErrorCode, type IngestionV3ErrorDetails } from '../../../../../../../lib/ingestion-v3-errors';

export const maxDuration = 30;

interface CancelJobResponse {
  success: boolean;
  updated?: boolean;
  error?: IngestionV3ErrorDetails;
}

interface CancelJobBody {
  error?: Partial<IngestionV3ErrorDetails>;
}

const DEFAULT_CANCEL_ERROR: IngestionV3ErrorDetails = {
  code: 'USER_CANCELLED',
  message: 'Cancelled by agent.',
  retryable: false,
  terminal: true,
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<NextResponse<CancelJobResponse>> {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'TASK_AUTH_INVALID',
            message: 'Missing Bearer token.',
            retryable: false,
            terminal: true,
          },
        },
        { status: 401 },
      );
    }

    const token = authHeader.split('Bearer ')[1];
    const decoded = await getAdminAuth().verifyIdToken(token);
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

    if (job.agentId && job.agentId !== decoded.uid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'TASK_AUTH_INVALID',
            message: 'You are not allowed to cancel this job.',
            retryable: false,
            terminal: true,
          },
        },
        { status: 403 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as CancelJobBody;
    const cancelError = normalizeCancelError(body.error);
    const result = await cancelIngestionV3Job(jobId, cancelError);

    return NextResponse.json({
      success: true,
      updated: result === 'updated',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to cancel ingestion job.';
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

function normalizeCancelError(input: Partial<IngestionV3ErrorDetails> | undefined): IngestionV3ErrorDetails {
  const codeInput = typeof input?.code === 'string' ? input.code.trim() : '';
  const code: IngestionV3ErrorCode = isIngestionV3ErrorCode(codeInput) ? codeInput : DEFAULT_CANCEL_ERROR.code;
  const message =
    typeof input?.message === 'string' && input.message.trim() ? input.message.trim() : DEFAULT_CANCEL_ERROR.message;
  const retryable = typeof input?.retryable === 'boolean' ? input.retryable : DEFAULT_CANCEL_ERROR.retryable;
  const terminal = typeof input?.terminal === 'boolean' ? input.terminal : DEFAULT_CANCEL_ERROR.terminal;
  return { code, message, retryable, terminal };
}

function isIngestionV3ErrorCode(value: string): value is IngestionV3ErrorCode {
  return Object.values(INGESTION_V3_ERROR_CODES).includes(value as IngestionV3ErrorCode);
}
