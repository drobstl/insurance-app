import { NextResponse } from 'next/server';
import { getAdminFirestore, getAdminStorage } from '../../../../../lib/firebase-admin';

export const maxDuration = 10;

export async function GET() {
  const startedAt = Date.now();
  try {
    // Prime Firebase Admin SDK + storage handles to reduce first-request latency.
    const db = getAdminFirestore();
    const bucket = getAdminStorage().bucket();

    await Promise.all([
      db.collection('ingestionJobsV2').limit(1).get(),
      bucket.getMetadata().catch(() => null),
    ]);

    return NextResponse.json({
      success: true,
      warmed: true,
      warmedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      warmed: false,
      error: error instanceof Error ? error.message : 'Warm request failed.',
      warmedMs: Date.now() - startedAt,
    });
  }
}
