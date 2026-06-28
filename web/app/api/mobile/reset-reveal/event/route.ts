import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { checkRateLimit, getClientIp } from '../../../../../lib/rate-limit';
import { resolveClientByAnyCode } from '../../../../../lib/resolve-client-by-code';
import {
  RESET_REVEAL_SHOWN_AT,
  RESET_REVEAL_DISMISSED_AT,
  RESET_REVEAL_ENGAGED_AT,
} from '../../../../../lib/reset-reveal';

/**
 * POST /api/mobile/reset-reveal/event
 *
 * Records that the reveal was shown / dismissed / engaged. Stamping the
 * matching field is what enforces the "event, not nag" cadence (the decision
 * endpoint reads these back), and 'engaged' (the client tapped "see if my
 * family qualifies") is also the signal the agent-side live nudge + Reconnect
 * pipeline read in Phase 2.
 *
 * Body: { clientCode, event: 'shown' | 'dismissed' | 'engaged' }
 */
const EVENT_FIELD: Record<string, string> = {
  shown: RESET_REVEAL_SHOWN_AT,
  dismissed: RESET_REVEAL_DISMISSED_AT,
  engaged: RESET_REVEAL_ENGAGED_AT,
};

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit(`reset-reveal-event:${ip}`, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
    }

    const { clientCode, event } = await req.json().catch(() => ({}));
    if (!clientCode || typeof clientCode !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid clientCode' }, { status: 400 });
    }
    const field = typeof event === 'string' ? EVENT_FIELD[event] : undefined;
    if (!field) {
      return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
    }

    const match = await resolveClientByAnyCode(clientCode);
    if (!match) return new NextResponse(null, { status: 204 });

    await match.clientRef.update({ [field]: FieldValue.serverTimestamp() });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('mobile/reset-reveal/event error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
