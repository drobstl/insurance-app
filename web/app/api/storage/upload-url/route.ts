import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getAdminStorage } from '../../../../lib/firebase-admin';

const MAX_UPLOAD_BYTES = 16 * 1024 * 1024;

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
    const file = getAdminStorage().bucket().file(gcsPath);

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
