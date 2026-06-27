import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { checkRateLimit, getClientIp } from '../../../../lib/rate-limit';
import { resolveClientByAnyCode } from '../../../../lib/resolve-client-by-code';

/**
 * POST /api/mobile/client-seen
 *
 * Lightweight "this client just opened their app" ping. Stamps `lastSeenAt`
 * and increments `lastSeenCount` on the per-agent client doc.
 *
 * Fired from the mobile root layout on mount + every foreground, INDEPENDENT
 * of push permission — unlike `registerAndSavePushToken`, which bails before
 * ever hitting the server when notifications are denied. So this captures
 * every activated client who opens the app, not just the push-enabled subset.
 *
 * This is the timing signal the reset/reveal surfaces key off: the agent's
 * "they're in their app right now" nudge, the warm list, and the in-app
 * reveal's cadence gating.
 *
 * Body: { clientCode: string }
 * Rate-limited to 30 req/min per IP (foreground toggles can be chatty); the
 * mobile helper also throttles client-side to one ping per 60s.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit(`client-seen:${ip}`, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
      );
    }

    const { clientCode } = await req.json();
    if (!clientCode || typeof clientCode !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid clientCode' }, { status: 400 });
    }

    const match = await resolveClientByAnyCode(clientCode);
    if (!match) {
      // Quietly no-op for non-clients (unconverted leads / beneficiaries). The
      // open signal is a client-only concern; no need to error the app over it.
      return new NextResponse(null, { status: 204 });
    }

    await match.clientRef.update({
      lastSeenAt: FieldValue.serverTimestamp(),
      lastSeenCount: FieldValue.increment(1),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('mobile/client-seen error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
