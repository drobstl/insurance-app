import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminStorage } from '../../../../../lib/firebase-admin';
import {
  createIngestionV3Job,
} from '../../../../../lib/ingestion-v3-store';
import {
  trackIngestionV3JobCreated,
} from '../../../../../lib/ingestion-v3-telemetry';
import type { IngestionV3Mode } from '../../../../../lib/ingestion-v3-types';
import type { IngestionV3SubmitJobResponse } from '../../../../../lib/types';

export const maxDuration = 60;

interface CreateIngestionV3JobBody {
  mode?: IngestionV3Mode;
  carrierFormType?: string;
  gcsPath?: string;
  gcsImagePaths?: string[];
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
    const carrierFormType = typeof body.carrierFormType === 'string' ? body.carrierFormType.trim() : '';
    const gcsPath = (body.gcsPath || '').trim();
    const gcsImagePaths = Array.isArray(body.gcsImagePaths)
      ? body.gcsImagePaths.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean)
      : [];
    const fileName = body.fileName?.trim();
    const sourceContentType = body.contentType?.trim();
    const idempotencyKey = body.idempotencyKey?.trim();

    if (mode === 'application' && !carrierFormType) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UPLOAD_SOURCE_INVALID',
            message: 'carrierFormType is required.',
            retryable: false,
            terminal: true,
          },
        },
        { status: 400 },
      );
    }

    if (mode === 'application') {
      if (!gcsImagePaths.length) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'UPLOAD_NOT_FOUND',
              message: 'gcsImagePaths is required for application jobs.',
              retryable: false,
              terminal: true,
            },
          },
          { status: 400 },
        );
      }

      const allImagesExist = await Promise.all(gcsImagePaths.map((path) => gcsPathExists(path)));
      if (allImagesExist.some((exists) => !exists)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'UPLOAD_NOT_FOUND',
              message: 'One or more uploaded images were not found in storage.',
              retryable: false,
              terminal: true,
            },
          },
          { status: 404 },
        );
      }
    } else if (!gcsPath) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UPLOAD_NOT_FOUND',
            message: 'gcsPath is required for bob jobs.',
            retryable: false,
            terminal: true,
          },
        },
        { status: 400 },
      );
    }

    if (mode === 'bob') {
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
    }

    const agentId = await getOptionalAgentId(req);

    const created = await createIngestionV3Job({
      mode,
      carrierFormType,
      gcsPath,
      gcsImagePaths,
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
