import { NextResponse } from 'next/server';
import type { IngestionV3ErrorDetails } from '../../../../../../../lib/ingestion-v3-errors';

export const maxDuration = 10;

interface ProcessJobResponse {
  success: boolean;
  error: IngestionV3ErrorDetails;
}

export async function POST(): Promise<NextResponse<ProcessJobResponse>> {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'TASK_AUTH_INVALID',
        message: 'Vercel processing endpoint is deprecated. Firestore-triggered GCF now owns ingestion processing.',
        retryable: false,
        terminal: true,
      },
    },
    { status: 410 },
  );
}
