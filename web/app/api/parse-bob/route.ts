import 'server-only';

import { NextResponse } from 'next/server';
import type { BobRow } from '../../../lib/bob-extractor';

interface ParseBobResponse {
  success: boolean;
  rows?: BobRow[];
  rowCount?: number;
  note?: string;
  error?: string;
}

export async function POST(): Promise<NextResponse<ParseBobResponse>> {
  return NextResponse.json(
    {
      success: false,
      error: 'This endpoint is deprecated. Use /api/ingestion/v3/upload-url then /api/ingestion/v3/jobs.',
    },
    { status: 410 },
  );
}
