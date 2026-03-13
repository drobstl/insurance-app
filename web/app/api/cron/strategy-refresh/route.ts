import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { synthesizeStrategy } from '../../../../lib/strategy-synthesizer';
import type { ConversationType } from '../../../../lib/learning-types';

/**
 * GET /api/cron/strategy-refresh
 *
 * Weekly cron: regenerates strategy documents for each conversation type
 * from the past 30 days of analyzed conversations.
 *
 * Schedule: 0 8 * * 0 (8 AM UTC every Sunday)
 */

export const maxDuration = 300;

const CONVERSATION_TYPES: ConversationType[] = [
  'referral',
  'conservation',
  'policy-review',
  'fif-reset',
];

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results: Record<string, string> = {};

    for (const type of CONVERSATION_TYPES) {
      try {
        await synthesizeStrategy(type);
        results[type] = 'success';
      } catch (error) {
        console.error(`Strategy synthesis failed for ${type}:`, error);
        results[type] = `error: ${error}`;
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Strategy refresh cron error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
