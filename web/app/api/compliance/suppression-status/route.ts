import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { getAdminAuth } from '../../../../lib/firebase-admin';
import { getSuppressionStatus } from '../../../../lib/suppression';
import { normalizePhone } from '../../../../lib/phone';

/**
 * GET /api/compliance/suppression-status?phone=+15551234567
 *
 * Returns the suppression state for a single phone. Used by client/lead
 * detail surfaces to render the "Opted out" chip, and by the manual-send
 * paths to decide whether to show the warning modal before firing the
 * `sms:` URL.
 *
 * Response shape:
 *   { suppressed: false, status: null }
 *   { suppressed: true, status: { phoneE164, suppressedAt, suppressedVia, ... } }
 *
 * Auth: any signed-in agent. The suppression list is global per number
 * across all agents (shared-line model), so the response is the same
 * regardless of which agent asks.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await getAdminAuth().verifyIdToken(token);

    const phoneRaw = req.nextUrl.searchParams.get('phone') || '';
    const phoneE164 = normalizePhone(phoneRaw);
    if (!phoneE164) {
      return NextResponse.json({ error: 'Missing phone param' }, { status: 400 });
    }
    const status = await getSuppressionStatus(phoneE164);
    const suppressed = status?.status === 'suppressed';
    return NextResponse.json({ suppressed, status: status ?? null });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[compliance:suppression-status] failed', { error: errMsg });
    if (errMsg.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
