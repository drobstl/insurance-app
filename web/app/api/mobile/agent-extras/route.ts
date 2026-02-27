import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { checkRateLimit, getClientIp } from '../../../../lib/rate-limit';

/**
 * GET /api/mobile/agent-extras?agentId=...&clientId=...&clientCode=...
 *
 * Returns extra agent fields (scheduling URL, business card, etc.) that are
 * too large or unnecessary for the initial login response. Authenticates via
 * clientCode against the client doc. Rate-limited to 20 requests/minute per IP.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request.headers);
    const rl = checkRateLimit(`agent-extras:${ip}`, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
      );
    }
    const { searchParams } = request.nextUrl;
    const agentId = searchParams.get('agentId');
    const clientId = searchParams.get('clientId');
    const clientCode = searchParams.get('clientCode');

    if (!agentId || !clientId || !clientCode) {
      return NextResponse.json(
        { error: 'agentId, clientId, and clientCode are required' },
        { status: 400 },
      );
    }

    const db = getAdminFirestore();

    const clientDoc = await db
      .collection('agents')
      .doc(agentId)
      .collection('clients')
      .doc(clientId)
      .get();

    if (!clientDoc.exists) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const storedCode = clientDoc.data()?.clientCode;
    if (!storedCode || storedCode !== clientCode.trim().toUpperCase()) {
      return NextResponse.json({ error: 'Invalid client code' }, { status: 403 });
    }

    const agentDoc = await db.collection('agents').doc(agentId).get();
    if (!agentDoc.exists) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const agentData = agentDoc.data()!;

    return NextResponse.json({
      businessCardBase64: agentData.businessCardBase64 ?? '',
      schedulingUrl: agentData.schedulingUrl ?? '',
      aiAssistantEnabled: agentData.aiAssistantEnabled !== false,
      linqPhoneNumber: agentData.linqPhoneNumber ?? '',
    });
  } catch (error) {
    console.error('agent-extras error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
