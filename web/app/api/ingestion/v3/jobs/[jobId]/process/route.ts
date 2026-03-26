import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { processIngestionV3Job } from '../../../../../../../lib/ingestion-v3-processor';
import { getIngestionV3Job } from '../../../../../../../lib/ingestion-v3-store';
import { trackIngestionV3ProcessAuthFailed } from '../../../../../../../lib/ingestion-v3-telemetry';

export const maxDuration = 120;

const oidcClient = new OAuth2Client();

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
  const authResult = await verifyCloudTaskOidc(req);
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

async function verifyCloudTaskOidc(req: NextRequest): Promise<{ ok: true } | { ok: false; message: string }> {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, message: 'Missing Bearer token.' };
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    return { ok: false, message: 'Missing OIDC token.' };
  }

  const expectedAudience = (
    process.env.INGESTION_V3_PROCESSOR_AUDIENCE || process.env.INGESTION_V3_PROCESSOR_BASE_URL || ''
  ).trim();
  if (!expectedAudience) {
    return { ok: false, message: 'Processor audience is not configured.' };
  }

  const expectedServiceAccount = (process.env.CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL || '').trim().toLowerCase();
  if (!expectedServiceAccount) {
    return { ok: false, message: 'Cloud Tasks service account is not configured.' };
  }

  try {
    const ticket = await oidcClient.verifyIdToken({
      idToken,
      audience: expectedAudience,
    });
    const payload = ticket.getPayload();
    if (!payload) return { ok: false, message: 'OIDC payload is missing.' };

    const issuer = payload.iss || '';
    if (issuer !== 'https://accounts.google.com' && issuer !== 'accounts.google.com') {
      return { ok: false, message: 'OIDC issuer is invalid.' };
    }

    const email = (payload.email || '').toLowerCase();
    if (!email || email !== expectedServiceAccount) {
      return { ok: false, message: 'OIDC token service account is not allowed.' };
    }

    if (payload.email_verified !== true) {
      return { ok: false, message: 'OIDC token email is not verified.' };
    }

    return { ok: true };
  } catch {
    return { ok: false, message: 'OIDC token verification failed.' };
  }
}
