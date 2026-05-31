import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { getAdminAuth } from '../../../../lib/firebase-admin';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';
import {
  recordConsentEvent,
  getSuppressionStatus,
  type ConsentLane,
} from '../../../../lib/suppression';

/**
 * POST /api/compliance/override
 *
 * Records an agent's deliberate decision to message a suppressed number.
 * Per `docs/afl-compliance-layer-whatwhy.md` Feature 1 — Manual sends:
 *
 *   "An agent manually messaging a suppressed number should not sail
 *    through silently. Surface a blocking warning ... and require a
 *    deliberate, recorded override to proceed. Don't hard-block it
 *    outright — but make it a conscious, logged act, not an accident."
 *
 * Flow:
 *   1. Agent taps a manual-send affordance (welcome card, sms: URL,
 *      composer, etc.) that lands on a suppressed number.
 *   2. Client UI shows the suppression-warning modal with a required
 *      typed-reason field.
 *   3. On confirm, the client POSTs here. We write the `override`
 *      consent event with the agent's typed reason.
 *   4. The client then proceeds with the actual send (sms: URL, in-app
 *      composer, etc.). Suppression state is NOT cleared by an override.
 *
 * The override does not unsuppress the number. The agent is asserting
 * "I have an out-of-band reason to message this person right now"
 * (e.g. a follow-up call they explicitly requested) — not retracting
 * the opt-out for the future.
 *
 * Body: { phoneE164, lane, typedReason, context? }
 * Auth: Bearer <Firebase ID token>
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = await getAdminAuth().verifyIdToken(token);
    const agentId = decoded.uid;

    const body = (await req.json().catch(() => null)) as
      | {
          phoneE164?: unknown;
          lane?: unknown;
          typedReason?: unknown;
          context?: unknown;
        }
      | null;

    const phoneE164 = normalizePhone(typeof body?.phoneE164 === 'string' ? body.phoneE164 : '');
    if (!isValidE164(phoneE164)) {
      return NextResponse.json({ error: 'Invalid phoneE164' }, { status: 400 });
    }

    const lane = (typeof body?.lane === 'string' ? body.lane : 'manual_send') as ConsentLane;
    const typedReason = typeof body?.typedReason === 'string' ? body.typedReason.trim() : '';
    if (typedReason.length < 8) {
      return NextResponse.json(
        { error: 'typedReason is required and must be at least 8 characters' },
        { status: 400 },
      );
    }

    // Confirm the phone is currently suppressed — if it isn't, the
    // override is moot and we 409 to keep the ledger clean. The client
    // should have already checked suppression state before showing the
    // modal; a 409 here usually means a resubscribe arrived in between.
    const status = await getSuppressionStatus(phoneE164);
    if (status?.status !== 'suppressed') {
      return NextResponse.json(
        {
          error: 'Phone is not currently suppressed; no override needed.',
          currentStatus: status?.status ?? 'not_listed',
        },
        { status: 409 },
      );
    }

    const context = (body?.context && typeof body.context === 'object')
      ? (body.context as Record<string, unknown>)
      : null;

    const event = await recordConsentEvent({
      type: 'override',
      phoneE164,
      agentId,
      lane,
      raw: typedReason,
      meta: context,
    });

    console.log('[compliance:override] recorded', {
      agentId,
      phoneE164,
      lane,
      eventId: event.eventId,
    });

    return NextResponse.json({ success: true, eventId: event.eventId });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[compliance:override] failed', { error: errMsg });
    if (errMsg.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
