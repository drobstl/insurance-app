import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { checkRateLimit, getClientIp } from '../../../../lib/rate-limit';
import { findClientByCode } from '../../../../lib/client-code-lookup';

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 60_000;

/**
 * POST /api/mobile/lookup-client-code
 *
 * Public endpoint for the mobile app. Looks up a client by client code using
 * the `clientCodes` index (O(1)) with fallback scan. Returns client + agent
 * data so the app can sign in without reading Firestore directly.
 *
 * Rate-limited to 10 requests/minute per IP.
 *
 * Body: { clientCode: string }
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const rl = checkRateLimit(`lookup:${ip}`, MAX_ATTEMPTS, WINDOW_MS);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const clientCode = typeof body?.clientCode === 'string' ? body.clientCode : '';

    if (!clientCode.trim()) {
      return NextResponse.json({ error: 'Missing or invalid clientCode' }, { status: 400 });
    }

    const match = await findClientByCode(clientCode);
    if (!match) {
      return NextResponse.json({ error: 'Client code not found' }, { status: 404 });
    }

    const db = getAdminFirestore();
    const [clientSnap, agentSnap] = await Promise.all([
      match.clientRef.get(),
      db.collection('agents').doc(match.agentId).get(),
    ]);

    const clientData = clientSnap.data() ?? {};
    const agentData = agentSnap.data() ?? {};

    return NextResponse.json({
      agentId: match.agentId,
      clientId: match.clientId,
      clientData: {
        name: clientData.name ?? '',
        email: clientData.email ?? '',
        phone: clientData.phone ?? '',
        clientCode: clientData.clientCode ?? clientCode.trim().toUpperCase(),
      },
      agentData: {
        name: agentData.name ?? 'Your Agent',
        email: agentData.email ?? '',
        phoneNumber: agentData.phoneNumber ?? '',
        agencyName: agentData.agencyName ?? '',
        referralMessage: agentData.referralMessage ?? '',
        photoBase64: agentData.photoBase64 ?? '',
        agencyLogoBase64: agentData.agencyLogoBase64 ?? '',
        businessCardBase64: agentData.businessCardBase64 ?? '',
      },
    });
  } catch (error) {
    console.error('lookup-client-code error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
