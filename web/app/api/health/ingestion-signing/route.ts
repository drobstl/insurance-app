import { NextResponse } from 'next/server';
import { classifySigningError, runIngestionSigningCanary } from '../../../../../lib/ingestion-signing-health';
import {
  trackIngestionV3SigningCanaryFailed,
  trackIngestionV3SigningCanarySucceeded,
} from '../../../../../lib/ingestion-v3-telemetry';

export const maxDuration = 60;

async function runSigningHealthCheck() {
  const result = await runIngestionSigningCanary();
  if (result.ok) {
    trackIngestionV3SigningCanarySucceeded({
      objectPath: result.objectPath,
      totalMs: result.timingsMs.total,
      signUrlMs: result.timingsMs.signUrl,
      putMs: result.timingsMs.put,
      verifyMs: result.timingsMs.verify,
    });
    return {
      statusCode: 200,
      payload: {
      status: 'healthy',
      check: 'ingestion-signing',
      timingsMs: result.timingsMs,
      timestamp: new Date().toISOString(),
      },
    };
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

  return {
    statusCode: 503,
    payload: {
      status: 'unhealthy',
      check: 'ingestion-signing',
      stage: result.stage,
      errorCode,
      message,
      timingsMs: result.timingsMs,
      timestamp: new Date().toISOString(),
    },
  };
}

export async function GET() {
  const result = await runSigningHealthCheck();
  return NextResponse.json(result.payload, { status: result.statusCode });
}

export async function HEAD() {
  const result = await runSigningHealthCheck();
  return new NextResponse(null, {
    status: result.statusCode,
    headers: {
      'x-ingestion-signing-status': String(result.payload.status),
      'x-ingestion-signing-check': 'ingestion-signing',
    },
  });
}
