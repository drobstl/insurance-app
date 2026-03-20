import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { pdfToBase64 } from '../../../lib/pdf-parser';
import { extractApplicationFields, extractApplicationFieldsFromText } from '../../../lib/application-extractor';
import { extractTextFromPdfBase64, isTextExtractionHighConfidence } from '../../../lib/pdf-text-extractor';
import type { ParseApplicationResponse } from '../../../lib/types';

export const maxDuration = 60;

const MAX_FILE_SIZE = 13 * 1024 * 1024;
const BLOB_FETCH_TIMEOUT_MS = 30_000;

export async function POST(req: NextRequest): Promise<NextResponse<ParseApplicationResponse>> {
  let blobUrl: string | undefined;
  let fileSizeBytes: number | undefined;
  const startedAt = Date.now();

  try {
    const contentType = req.headers.get('content-type') || '';
    let pdfBase64: string | undefined;
    let sourceMs = 0;

    // ── Path 1: Direct file upload via FormData (fallback when Blob is unavailable) ──
    if (contentType.includes('multipart/form-data')) {
      const sourceStart = Date.now();
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
      fileSizeBytes = file.size;
      const buffer = Buffer.from(await file.arrayBuffer());
      pdfBase64 = pdfToBase64(buffer);
      sourceMs = Date.now() - sourceStart;
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
        fileSizeBytes = byteLength;
        pdfBase64 = body.base64;
        sourceMs = 0;
      } else if (body.url) {
        const sourceStart = Date.now();
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

        fileSizeBytes = arrayBuffer.byteLength;
        pdfBase64 = pdfToBase64(Buffer.from(arrayBuffer));
        sourceMs = Date.now() - sourceStart;
      }
    }

    if (!pdfBase64) {
      return NextResponse.json(
        { success: false, error: 'No PDF file provided.' },
        { status: 400 },
      );
    }

    let extraction;
    let extractMs = 0;
    let textExtractMs = 0;
    let parserPath: 'ai-pdf' | 'ai-text' = 'ai-pdf';
    try {
      const extractStart = Date.now();
      const textStart = Date.now();
      const extractedText = await extractTextFromPdfBase64(pdfBase64);
      textExtractMs = Date.now() - textStart;

      if (isTextExtractionHighConfidence(extractedText)) {
        extraction = await extractApplicationFieldsFromText(extractedText!);
        parserPath = 'ai-text';
      } else {
        extraction = await extractApplicationFields(pdfBase64, { fileSizeBytes });
      }
      extractMs = Date.now() - extractStart;
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
      timings: {
        totalMs: Date.now() - startedAt,
        sourceMs,
        extractMs,
        textExtractMs,
        parserPath,
      },
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
