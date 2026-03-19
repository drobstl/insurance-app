import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { pdfToBase64 } from '../../../lib/pdf-parser';
import { extractApplicationFields } from '../../../lib/application-extractor';
import type { ParseApplicationResponse } from '../../../lib/types';

export const maxDuration = 60;

const MAX_FILE_SIZE = 13 * 1024 * 1024;
const BLOB_FETCH_TIMEOUT_MS = 30_000;

export async function POST(req: NextRequest): Promise<NextResponse<ParseApplicationResponse>> {
  let blobUrl: string | undefined;

  try {
    const contentType = req.headers.get('content-type') || '';
    let pdfBase64: string | undefined;

    // ── Path 1: Direct file upload via FormData (fallback when Blob is unavailable) ──
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json(
          { success: false, error: 'No PDF file provided.' },
          { status: 400 },
        );
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { success: false, error: 'File is too large. Maximum size is 13MB.' },
          { status: 400 },
        );
      }

      console.log(`[parse-application] Direct FormData upload: ${file.name} (${(file.size / 1024).toFixed(0)}KB)`);
      const buffer = Buffer.from(await file.arrayBuffer());
      pdfBase64 = pdfToBase64(buffer);
    } else {
      // ── Path 2 & 3: JSON body with url or base64 ──
      const body = (await req.json()) as { url?: string; base64?: string };

      if (body.base64) {
        const byteLength = Math.ceil(body.base64.length * 0.75);
        if (byteLength > MAX_FILE_SIZE) {
          return NextResponse.json(
            { success: false, error: 'File is too large. Maximum size is 13MB.' },
            { status: 400 },
          );
        }
        console.log(`[parse-application] Direct base64 upload (${(byteLength / 1024).toFixed(0)}KB)`);
        pdfBase64 = body.base64;
      } else if (body.url) {
        blobUrl = body.url;
        console.log(`[parse-application] Blob URL upload: ${body.url}`);

        let fileRes: Response;
        try {
          fileRes = await fetch(body.url, { signal: AbortSignal.timeout(BLOB_FETCH_TIMEOUT_MS) });
        } catch (fetchErr) {
          const isTimeout =
            fetchErr instanceof Error &&
            (fetchErr.name === 'TimeoutError' || fetchErr.name === 'AbortError' || fetchErr.message.toLowerCase().includes('timeout'));
          if (isTimeout) {
            return NextResponse.json(
              { success: false, error: 'Timed out retrieving uploaded file. Please try again.' },
              { status: 504 },
            );
          }
          throw fetchErr;
        }
        if (!fileRes.ok) {
          return NextResponse.json(
            { success: false, error: 'Failed to retrieve uploaded file.' },
            { status: 400 },
          );
        }

        const arrayBuffer = await fileRes.arrayBuffer();
        if (arrayBuffer.byteLength > MAX_FILE_SIZE) {
          return NextResponse.json(
            { success: false, error: 'File is too large. Maximum size is 13MB.' },
            { status: 400 },
          );
        }

        pdfBase64 = pdfToBase64(Buffer.from(arrayBuffer));
      }
    }

    if (!pdfBase64) {
      return NextResponse.json(
        { success: false, error: 'No PDF file provided.' },
        { status: 400 },
      );
    }

    let extraction;
    try {
      extraction = await extractApplicationFields(pdfBase64);
    } catch (aiError) {
      const message = aiError instanceof Error ? aiError.message : 'AI extraction failed.';
      console.error('[parse-application] AI extraction failed:', aiError);
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 },
      );
    }

    console.log('[parse-application] Extraction successful');
    return NextResponse.json({
      success: true,
      data: extraction.data,
      note: extraction.note,
    });
  } catch (error) {
    console.error('[parse-application] Unhandled error:', error);
    return NextResponse.json(
      { success: false, error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  } finally {
    if (blobUrl) {
      del(blobUrl).catch(() => {});
    }
  }
}
