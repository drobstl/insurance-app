import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { checkRateLimit, getClientIp } from '../../../../lib/rate-limit';
import { findClientByCode } from '../../../../lib/client-code-lookup';
import { findLeadByCode } from '../../../../lib/lead-code-lookup';
import { PUSH_PERMISSION_REVOKED_FIELD } from '../../../../lib/push-permission-lifecycle';

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

    // First try as a client code. If that misses, fall back to a lead code
    // (which start with `L`). Same Firestore lifecycle on both — pushToken
    // field + PUSH_PERMISSION_REVOKED_FIELD cleared. The push send path
    // (sendExpoPush) doesn't care whether the holder doc is a client or a
    // lead; it just looks up pushToken + pushPermissionRevokedAt.
    const clientMatch = await findClientByCode(clientCode);
    if (clientMatch) {
      await clientMatch.clientRef.update({
        pushToken,
        [PUSH_PERMISSION_REVOKED_FIELD]: FieldValue.delete(),
      });
      return NextResponse.json({
        success: true,
        agentId: clientMatch.agentId,
        clientId: clientMatch.clientId,
        kind: 'client',
      });
    }

    const leadMatch = await findLeadByCode(clientCode);
    if (leadMatch) {
      await leadMatch.leadRef.update({
        pushToken,
        [PUSH_PERMISSION_REVOKED_FIELD]: FieldValue.delete(),
      });
      return NextResponse.json({
        success: true,
        agentId: leadMatch.agentId,
        leadId: leadMatch.leadId,
        kind: 'lead',
      });
    }

    return NextResponse.json({ error: 'Code not found' }, { status: 404 });
  } catch (error) {
    console.error('push-token/register error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
