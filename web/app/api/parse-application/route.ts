import { NextResponse } from 'next/server';
import type { ParseApplicationResponse } from '../../../lib/types';

export async function POST(): Promise<NextResponse<ParseApplicationResponse>> {
  return NextResponse.json(
    {
      success: false,
      error: 'This endpoint is deprecated. Use /api/ingestion/v3/upload-url then /api/ingestion/v3/jobs.',
    },
    { status: 410 },
  );
}
