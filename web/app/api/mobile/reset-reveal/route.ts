import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '../../../../lib/rate-limit';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { resolveClientByAnyCode } from '../../../../lib/resolve-client-by-code';
import { buildResetRevealDecision } from '../../../../lib/reset-reveal';

/**
 * POST /api/mobile/reset-reveal
 *
 * The mobile app asks: "should I show the reset reveal right now, and if so,
 * with what data?" The server owns eligibility + cadence so the reveal stays
 * an event, not a nag — the app just renders whatever comes back.
 *
 * Body: { clientCode }
 * Response: { show: false, reason } | { show: true, reveal: {...} }
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit(`reset-reveal:${ip}`, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ show: false, reason: 'rate_limited' }, { status: 429 });
    }

    const { clientCode } = await req.json().catch(() => ({}));
    if (!clientCode || typeof clientCode !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid clientCode' }, { status: 400 });
    }

    const match = await resolveClientByAnyCode(clientCode);
    if (!match) return NextResponse.json({ show: false, reason: 'not_a_client' });

    const db = getAdminFirestore();
    const [clientSnap, agentSnap] = await Promise.all([
      match.clientRef.get(),
      db.collection('agents').doc(match.agentId).get(),
    ]);

    const decision = buildResetRevealDecision(clientSnap.data() ?? {}, agentSnap.data() ?? {});
    return NextResponse.json(decision);
  } catch (error) {
    console.error('mobile/reset-reveal error:', error);
    return NextResponse.json({ show: false, reason: 'error' }, { status: 500 });
  }
}
