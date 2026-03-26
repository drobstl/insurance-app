import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminStorage } from '../../../../../lib/firebase-admin';
import type { IngestionV3UploadPurpose } from '../../../../../lib/ingestion-v3-types';
import type { IngestionV3ErrorDetails } from '../../../../../lib/types';

export const maxDuration = 60;

const MAX_UPLOAD_BYTES = 16 * 1024 * 1024;
const SIGNED_URL_TTL_MS = 10 * 60 * 1000;
let corsConfigured = false;

interface UploadUrlRequestBody {
  fileName?: string;
  contentType?: string;
  fileSize?: number;
  purpose?: IngestionV3UploadPurpose;
}

interface IngestionV3UploadUrlResponse {
  success: boolean;
  uploadUrl?: string;
  gcsPath?: string;
  error?: IngestionV3ErrorDetails;
}

export async function POST(req: NextRequest): Promise<NextResponse<IngestionV3UploadUrlResponse>> {
  try {
    const body = (await req.json()) as UploadUrlRequestBody;
    const fileName = (body.fileName || '').trim();
    const contentType = (body.contentType || 'application/octet-stream').trim();
    const fileSize = typeof body.fileSize === 'number' ? body.fileSize : 0;
    const purpose = body.purpose === 'bob' ? 'bob' : 'application';

    if (!fileName) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UPLOAD_SOURCE_INVALID',
            message: 'fileName is required.',
            retryable: false,
            terminal: true,
          },
        },
        { status: 400 },
      );
    }

    if (fileSize <= 0 || fileSize > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UPLOAD_SOURCE_INVALID',
            message: 'File size is invalid for upload URL generation.',
            retryable: false,
            terminal: true,
          },
        },
        { status: 400 },
      );
    }

    const safeName = sanitizeFileName(fileName);
    const gcsPath = `ingestion/v3/${purpose}/${Date.now()}-${randomUUID()}-${safeName}`;
    const bucket = getAdminStorage().bucket();
    await ensureBucketCors(bucket);
    const file = bucket.file(gcsPath);

    const [uploadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + SIGNED_URL_TTL_MS,
      contentType,
    });

    return NextResponse.json({ success: true, uploadUrl, gcsPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create upload URL.';
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

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function ensureBucketCors(bucket: any) {
  if (corsConfigured) return;
  try {
    await bucket.setCorsConfiguration([
      {
        origin: [
          'https://agentforlife.app',
          'https://www.agentforlife.app',
          'https://*.vercel.app',
          'http://localhost:3000',
        ],
        method: ['PUT', 'POST', 'GET', 'HEAD', 'OPTIONS'],
        responseHeader: ['Content-Type', 'Authorization', 'x-goog-resumable'],
        maxAgeSeconds: 3600,
      },
    ]);
    corsConfigured = true;
  } catch (err) {
    // Keep route non-fatal if permission is limited; signer still works.
    console.warn('[ingestion/v3/upload-url] Unable to set bucket CORS automatically:', err);
  }
}
