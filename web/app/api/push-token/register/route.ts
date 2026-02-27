import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '../../../../lib/rate-limit';
import { findClientByCode } from '../../../../lib/client-code-lookup';

/**
 * POST /api/push-token/register
 *
 * Called by the mobile app after obtaining an Expo push token.
 * Writes the token to the client document using the Admin SDK,
 * which bypasses Firestore security rules entirely.
 * Rate-limited to 10 requests/minute per IP.
 *
 * Body: { clientCode: string, pushToken: string }
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit(`push-token:${ip}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
      );
    }

    const { clientCode, pushToken } = await req.json();

    if (!clientCode || typeof clientCode !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid clientCode' }, { status: 400 });
    }
    if (!pushToken || typeof pushToken !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid pushToken' }, { status: 400 });
    }

    const match = await findClientByCode(clientCode);
    if (!match) {
      return NextResponse.json({ error: 'Client code not found' }, { status: 404 });
    }

    await match.clientRef.update({ pushToken });

    return NextResponse.json({
      success: true,
      agentId: match.agentId,
      clientId: match.clientId,
    });
  } catch (error) {
    console.error('push-token/register error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
