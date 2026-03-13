import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { checkAndResolveExperiment } from '../../../../lib/experiment-framework';
import { getStrategy, rollbackStrategy } from '../../../../lib/conversation-memory';
import type { ConversationType } from '../../../../lib/learning-types';

/**
 * GET /api/cron/experiment-check
 *
 * Daily cron: checks running A/B experiments for statistical significance.
 * Auto-promotes winning strategy variants and archives losers.
 *
 * Schedule: 0 10 * * * (10 AM UTC daily)
 */

export const maxDuration = 60;

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
    const results: Record<string, unknown> = {};

    for (const type of CONVERSATION_TYPES) {
      try {
        const { resolved, result } = await checkAndResolveExperiment(type);

        if (!result) {
          results[type] = 'no active experiment';
          continue;
        }

        if (resolved && result.winner === 'variant') {
          const strategy = await getStrategy(type);
          if (strategy) {
            console.log(
              `Experiment winner for ${type}: variant. Variant strategy is already in rotation via the experiment framework.`,
            );
          }
        }

        results[type] = {
          resolved,
          winner: result.winner,
          pValue: result.pValue,
          controlRate: result.controlRate,
          variantRate: result.variantRate,
          effectSize: result.effectSize,
        };
      } catch (error) {
        console.error(`Experiment check failed for ${type}:`, error);
        results[type] = `error: ${error}`;
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Experiment check cron error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
