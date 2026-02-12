import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromPdf } from '../../../lib/pdf-parser';
import { extractApplicationFields } from '../../../lib/application-extractor';
import type { ParseApplicationResponse } from '../../../lib/types';

/** Allow up to 60 seconds for PDF parsing + AI extraction (Vercel Pro). */
export const maxDuration = 60;

/** Maximum file size: 10MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(req: NextRequest): Promise<NextResponse<ParseApplicationResponse>> {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'No PDF file provided.' },
        { status: 400 }
      );
    }

    // Validate file type
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { success: false, error: 'Please upload a PDF file.' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'File is too large. Maximum size is 10MB.' },
        { status: 400 }
      );
    }

    // Step 1: Extract text from PDF
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let pdfResult;
    try {
      pdfResult = await extractTextFromPdf(buffer);
    } catch (pdfError) {
      const message = pdfError instanceof Error ? pdfError.message : 'Failed to read the PDF.';
      return NextResponse.json(
        { success: false, error: message },
        { status: 422 }
      );
    }

    // Step 2: Extract fields using AI
    let extraction;
    try {
      extraction = await extractApplicationFields(pdfResult.text);
    } catch (aiError) {
      const message = aiError instanceof Error ? aiError.message : 'AI extraction failed.';
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: extraction.data,
      pageCount: pdfResult.pageCount,
      note: extraction.note,
    });
  } catch (error) {
    console.error('Parse application error:', error);
    return NextResponse.json(
      { success: false, error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
