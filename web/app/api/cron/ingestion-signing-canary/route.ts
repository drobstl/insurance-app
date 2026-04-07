import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { classifySigningError, runIngestionSigningCanary } from '../../../../lib/ingestion-signing-health';
import {
  trackIngestionV3SigningCanaryFailed,
  trackIngestionV3SigningCanarySucceeded,
} from '../../../../lib/ingestion-v3-telemetry';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runIngestionSigningCanary();
  if (result.ok) {
    trackIngestionV3SigningCanarySucceeded({
      objectPath: result.objectPath,
      totalMs: result.timingsMs.total,
      signUrlMs: result.timingsMs.signUrl,
      putMs: result.timingsMs.put,
      verifyMs: result.timingsMs.verify,
    });
    return NextResponse.json({
      success: true,
      timingsMs: result.timingsMs,
      objectPath: result.objectPath,
    });
  }

  const message = result.details || 'Signing canary failed.';
  const errorCode = classifySigningError(message);
  trackIngestionV3SigningCanaryFailed({
    stage: result.stage,
    errorCode,
    errorMessage: message,
    objectPath: result.objectPath,
    totalMs: result.timingsMs.total,
  });
  console.error('[ingestion-v3-alert] signing canary failed', {
    stage: result.stage,
    errorCode,
    message,
  });

  return NextResponse.json(
    {
      success: false,
      stage: result.stage,
      errorCode,
      message,
      timingsMs: result.timingsMs,
    },
    { status: 503 },
  );
}
