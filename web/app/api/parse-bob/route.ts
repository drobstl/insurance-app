import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { getAdminAuth } from '../../../lib/firebase-admin';
import { pdfToBase64 } from '../../../lib/pdf-parser';
import { extractBobFromPdf, extractBobFromText } from '../../../lib/bob-extractor';
import type { BobRow } from '../../../lib/bob-extractor';

export const maxDuration = 120;

const MAX_FILE_SIZE = 15 * 1024 * 1024;

interface ParseBobResponse {
  success: boolean;
  rows?: BobRow[];
  rowCount?: number;
  note?: string;
  error?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse<ParseBobResponse>> {
  let blobUrl: string | undefined;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const authToken = authHeader.split('Bearer ')[1];
    const adminAuth = getAdminAuth();
    await adminAuth.verifyIdToken(authToken);

    const reqContentType = req.headers.get('content-type') || '';
    let result: Awaited<ReturnType<typeof extractBobFromPdf>> | undefined;

    // ── Path 1: Direct file upload via FormData (fallback when Blob is unavailable) ──
    if (reqContentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json({ success: false, error: 'No file provided.' }, { status: 400 });
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { success: false, error: 'File is too large. Maximum size is 15MB.' },
          { status: 400 },
        );
      }

      console.log(`[parse-bob] Direct FormData upload: ${file.name} (${(file.size / 1024).toFixed(0)}KB)`);
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const arrayBuffer = await file.arrayBuffer();

      if (isPdf) {
        const pdfBase64 = pdfToBase64(Buffer.from(arrayBuffer));
        result = await extractBobFromPdf(pdfBase64);
      } else {
        const text = new TextDecoder().decode(arrayBuffer);
        if (!text.trim()) {
          return NextResponse.json({ success: false, error: 'File is empty.' }, { status: 400 });
        }
        result = await extractBobFromText(text);
      }
    } else {
      // ── Paths 2, 3, 4: JSON body ──
      const body = (await req.json()) as {
        url?: string;
        base64?: string;
        textContent?: string;
        fileName?: string;
      };

      if (body.base64) {
        const byteLength = Math.ceil(body.base64.length * 0.75);
        if (byteLength > MAX_FILE_SIZE) {
          return NextResponse.json(
            { success: false, error: 'File is too large. Maximum size is 15MB.' },
            { status: 400 },
          );
        }

        console.log(`[parse-bob] Direct base64 upload (${(byteLength / 1024).toFixed(0)}KB)`);
        const isPdf = body.fileName?.toLowerCase().endsWith('.pdf') !== false;

        if (isPdf) {
          result = await extractBobFromPdf(body.base64);
        } else {
          const text = Buffer.from(body.base64, 'base64').toString('utf-8');
          if (!text.trim()) {
            return NextResponse.json({ success: false, error: 'File is empty.' }, { status: 400 });
          }
          result = await extractBobFromText(text);
        }
      } else if (body.textContent) {
        if (!body.textContent.trim()) {
          return NextResponse.json({ success: false, error: 'File is empty.' }, { status: 400 });
        }
        console.log(`[parse-bob] Direct text content (${(body.textContent.length / 1024).toFixed(0)}KB)`);
        result = await extractBobFromText(body.textContent);
      } else if (body.url) {
        blobUrl = body.url;
        console.log(`[parse-bob] Blob URL upload: ${body.url}`);

        const fileRes = await fetch(body.url);
        if (!fileRes.ok) {
          return NextResponse.json(
            { success: false, error: 'Failed to retrieve uploaded file.' },
            { status: 400 },
          );
        }

        const blobContentType = fileRes.headers.get('content-type') || '';
        const arrayBuffer = await fileRes.arrayBuffer();

        if (arrayBuffer.byteLength > MAX_FILE_SIZE) {
          return NextResponse.json(
            { success: false, error: 'File is too large. Maximum size is 15MB.' },
            { status: 400 },
          );
        }

        const isPdf = blobContentType.includes('application/pdf') || body.url.toLowerCase().endsWith('.pdf');

        if (isPdf) {
          const pdfBase64 = pdfToBase64(Buffer.from(arrayBuffer));
          result = await extractBobFromPdf(pdfBase64);
        } else {
          const text = new TextDecoder().decode(arrayBuffer);
          if (!text.trim()) {
            return NextResponse.json({ success: false, error: 'File is empty.' }, { status: 400 });
          }
          result = await extractBobFromText(text);
        }
      } else {
        return NextResponse.json({ success: false, error: 'No file provided.' }, { status: 400 });
      }
    }

    if (!result || !result.rows || result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No client or policy data found in the file.', note: result?.note },
        { status: 400 },
      );
    }

    console.log(`[parse-bob] Extraction successful: ${result.rows.length} rows`);
    return NextResponse.json({
      success: true,
      rows: result.rows,
      rowCount: result.rowCount,
      note: result.note,
    });
  } catch (error) {
    console.error('[parse-bob] Unhandled error:', error);
    const message =
      error instanceof Error ? error.message : 'Something went wrong. Please try again.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  } finally {
    if (blobUrl) {
      del(blobUrl).catch(() => {});
    }
  }
}
