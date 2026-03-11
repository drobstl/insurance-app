import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { pdfToBase64 } from '../../../lib/pdf-parser';
import { extractApplicationFields } from '../../../lib/application-extractor';
import type { ParseApplicationResponse } from '../../../lib/types';

/** Allow up to 60 seconds for PDF parsing + AI extraction (Vercel Pro). */
export const maxDuration = 60;

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(req: NextRequest): Promise<NextResponse<ParseApplicationResponse>> {
  let blobUrl: string | undefined;

  try {
    const { url } = (await req.json()) as { url?: string };

    if (!url) {
      return NextResponse.json(
        { success: false, error: 'No PDF file provided.' },
        { status: 400 },
      );
    }

    blobUrl = url;

    const fileRes = await fetch(url);
    if (!fileRes.ok) {
      return NextResponse.json(
        { success: false, error: 'Failed to retrieve uploaded file.' },
        { status: 400 },
      );
    }

    const arrayBuffer = await fileRes.arrayBuffer();

    if (arrayBuffer.byteLength > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'File is too large. Maximum size is 10MB.' },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(arrayBuffer);
    const pdfBase64 = pdfToBase64(buffer);

    let extraction;
    try {
      extraction = await extractApplicationFields(pdfBase64);
    } catch (aiError) {
      const message = aiError instanceof Error ? aiError.message : 'AI extraction failed.';
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: extraction.data,
      note: extraction.note,
    });
  } catch (error) {
    console.error('Parse application error:', error);
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
