import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getAdminStorage } from '../../../../lib/firebase-admin';

const MAX_UPLOAD_BYTES = 16 * 1024 * 1024;
let corsConfigured = false;

interface UploadUrlResponse {
  success: boolean;
  uploadUrl?: string;
  gcsPath?: string;
  error?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse<UploadUrlResponse>> {
  try {
    const body = (await req.json()) as {
      fileName?: string;
      contentType?: string;
      fileSize?: number;
      purpose?: 'application' | 'bob';
    };

    const fileName = (body.fileName || '').trim();
    const contentType = (body.contentType || 'application/octet-stream').trim();
    const fileSize = typeof body.fileSize === 'number' ? body.fileSize : 0;
    const purpose = body.purpose === 'bob' ? 'bob' : 'application';

    if (!fileName) {
      return NextResponse.json({ success: false, error: 'fileName is required.' }, { status: 400 });
    }
    if (fileSize <= 0 || fileSize > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ success: false, error: 'File size is invalid for upload URL generation.' }, { status: 400 });
    }

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const gcsPath = `ingestion/${purpose}/${Date.now()}-${randomUUID()}-${safeName}`;
    const bucket = getAdminStorage().bucket();
    await ensureBucketCors(bucket);
    const file = bucket.file(gcsPath);

    const [uploadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 10 * 60 * 1000,
      contentType,
    });

    return NextResponse.json({ success: true, uploadUrl, gcsPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create upload URL.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
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
    // Keep route non-fatal if permission is limited; caller still has fallback uploader.
    console.warn('[storage/upload-url] Unable to set bucket CORS automatically:', err);
  }
}
