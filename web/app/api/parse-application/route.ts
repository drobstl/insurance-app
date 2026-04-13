import { NextRequest, NextResponse } from 'next/server';
import { extractApplicationFields } from '../../../lib/application-extractor';
import type { ParseApplicationResponse } from '../../../lib/types';

const MAX_APPLICATION_PDF_BYTES = 16 * 1024 * 1024;

export async function POST(req: NextRequest): Promise<NextResponse<ParseApplicationResponse>> {
  const startedAt = Date.now();
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'Missing PDF file.' },
        { status: 400 },
      );
    }

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      return NextResponse.json(
        { success: false, error: 'Please upload a PDF file.' },
        { status: 400 },
      );
    }
    if (file.size > MAX_APPLICATION_PDF_BYTES) {
      return NextResponse.json(
        { success: false, error: 'This file is too large. Please upload a PDF under 16 MB.' },
        { status: 400 },
      );
    }

    const sourceStart = Date.now();
    const bytes = Buffer.from(await file.arrayBuffer());
    const sourceMs = Date.now() - sourceStart;
    const pdfBase64 = bytes.toString('base64');

    const extractStart = Date.now();
    const extracted = await extractApplicationFields(pdfBase64, { fileSizeBytes: file.size });
    const extractMs = Date.now() - extractStart;

    return NextResponse.json({
      success: true,
      data: extracted.data,
      note: extracted.note || undefined,
      pageCount: 0,
      timings: {
        totalMs: Date.now() - startedAt,
        sourceMs,
        extractMs,
        parserPath: 'ai-pdf',
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? mapParseApplicationError(error.message)
        : 'We could not read this file right now. Please try again or enter fields manually.';
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 },
    );
  }
}

function mapParseApplicationError(rawMessage: string): string {
  const message = rawMessage.toLowerCase();
  if (message.includes('anthropic_api_key') || message.includes('api key')) {
    return 'Extraction is temporarily unavailable. Please try again in a moment.';
  }
  if (message.includes('timeout') || message.includes('timed out')) {
    return 'Parsing timed out. Please try again.';
  }
  if (message.includes('parse ai response') || message.includes('invalid') || message.includes('schema')) {
    return 'We had trouble reading this file. Please review any missing fields.';
  }
  return 'We could not read this file right now. Please try again or enter fields manually.';
}
