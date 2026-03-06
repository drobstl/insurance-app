import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
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
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const adminAuth = getAdminAuth();
    await adminAuth.verifyIdToken(token);

    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'No file provided.' },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'File is too large. Maximum size is 15MB.' },
        { status: 400 },
      );
    }

    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    let result;

    if (isPdf) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const pdfBase64 = pdfToBase64(buffer);
      result = await extractBobFromPdf(pdfBase64);
    } else {
      const text = await file.text();
      if (!text.trim()) {
        return NextResponse.json(
          { success: false, error: 'File is empty.' },
          { status: 400 },
        );
      }
      result = await extractBobFromText(text);
    }

    if (!result.rows || result.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No client or policy data found in the file.',
          note: result.note,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      rows: result.rows,
      rowCount: result.rowCount,
      note: result.note,
    });
  } catch (error) {
    console.error('Parse BOB error:', error);
    const message =
      error instanceof Error ? error.message : 'Something went wrong. Please try again.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
