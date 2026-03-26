import { NextRequest, NextResponse } from 'next/server';
import { enqueueIngestionV3ProcessJob } from '../../../../../../lib/cloud-tasks';
import { getAdminAuth, getAdminStorage } from '../../../../../../lib/firebase-admin';
import {
  createIngestionV3Job,
  findExistingIngestionV3JobByIdempotency,
  setIngestionV3JobError,
} from '../../../../../../lib/ingestion-v3-store';
import {
  trackIngestionV3JobCreated,
  trackIngestionV3TaskEnqueued,
  trackIngestionV3TaskEnqueueFailed,
} from '../../../../../../lib/ingestion-v3-telemetry';
import type { IngestionV3Mode } from '../../../../../../lib/ingestion-v3-types';
import type { IngestionV3SubmitJobResponse } from '../../../../../../lib/types';

export const maxDuration = 60;

interface CreateIngestionV3JobBody {
  mode?: IngestionV3Mode;
  gcsPath?: string;
  fileName?: string;
  contentType?: string;
  idempotencyKey?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse<IngestionV3SubmitJobResponse>> {
  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UPLOAD_SOURCE_INVALID',
            message: 'Unsupported content type. Use application/json.',
            retryable: false,
            terminal: true,
          },
        },
        { status: 400 },
      );
    }

    const body = (await req.json()) as CreateIngestionV3JobBody;
    const mode = body.mode === 'bob' ? 'bob' : 'application';
    const gcsPath = (body.gcsPath || '').trim();
    const fileName = body.fileName?.trim();
    const sourceContentType = body.contentType?.trim();
    const idempotencyKey = body.idempotencyKey?.trim();

    if (!gcsPath) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UPLOAD_NOT_FOUND',
            message: 'gcsPath is required.',
            retryable: false,
            terminal: true,
          },
        },
        { status: 400 },
      );
    }

    const exists = await gcsPathExists(gcsPath);
    if (!exists) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UPLOAD_NOT_FOUND',
            message: 'Uploaded file was not found in storage.',
            retryable: false,
            terminal: true,
          },
        },
        { status: 404 },
      );
    }

    const agentId = await getOptionalAgentId(req);
    const existing = await findExistingIngestionV3JobByIdempotency({
      agentId,
      idempotencyKey,
    });
    if (existing) {
      return NextResponse.json({
        success: true,
        jobId: existing.id,
        status: existing.status,
      });
    }

    const created = await createIngestionV3Job({
      mode,
      gcsPath,
      fileName,
      contentType: sourceContentType,
      agentId,
      idempotencyKey,
      maxAttempts: 4,
    });
    trackIngestionV3JobCreated({
      jobId: created.id,
      mode,
      agentId,
      maxAttempts: created.maxAttempts,
    });

    try {
      await enqueueIngestionV3ProcessJob(created.id);
      trackIngestionV3TaskEnqueued({
        jobId: created.id,
        mode,
      });
    } catch (enqueueError) {
      const enqueueMessage =
        enqueueError instanceof Error ? enqueueError.message : 'Failed to dispatch processing task.';
      const typedError = {
        code: 'TASK_ENQUEUE_FAILED' as const,
        message: enqueueMessage,
        retryable: true,
        terminal: false,
      };
      await setIngestionV3JobError(
        created.id,
        typedError,
        'failed',
      );
      trackIngestionV3TaskEnqueueFailed({
        jobId: created.id,
        mode,
        error: typedError,
      });

      return NextResponse.json(
        {
          success: false,
          error: typedError,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      jobId: created.id,
      status: created.status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create ingestion v3 job.';
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

async function gcsPathExists(gcsPath: string): Promise<boolean> {
  try {
    const [exists] = await getAdminStorage().bucket().file(gcsPath).exists();
    return !!exists;
  } catch {
    return false;
  }
}

async function getOptionalAgentId(req: NextRequest): Promise<string | undefined> {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return undefined;
    const token = authHeader.split('Bearer ')[1];
    const decoded = await getAdminAuth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    return undefined;
  }
}
