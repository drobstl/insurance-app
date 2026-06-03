import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { getAdminAuth } from '../../../../lib/firebase-admin';
import { normalizePhone, isValidE164 } from '../../../../lib/phone';
import {
  suppressNumber,
  resubscribeNumber,
  getSuppressionStatus,
} from '../../../../lib/suppression';

/**
 * /api/compliance/do-not-contact
 *
 * Agent-initiated "do not contact" — the manual suppression path reserved
 * by `docs/afl-compliance-layer-whatwhy.md` (the `'manual'` trigger, until
 * now unused). Lets an agent proactively add a number to the global
 * suppression list — e.g. after a "please don't contact me" request made
 * by phone or in person — enforced everywhere by the same gate that
 * handles inbound STOP. No cadence/lane changes; purely additive.
 *
 *   POST   { phoneE164, note? }   -> mark do-not-contact (suppress, trigger 'manual')
 *   DELETE ?phone=<E164>          -> clear, ONLY if the suppression was agent-set ('manual')
 *
 * Safety: a recipient's own opt-out (STOP keyword / natural-language
 * phrase) can NEVER be cleared by an agent here — undoing a real opt-out
 * is exactly the violation this layer exists to prevent. Only an
 * agent-set manual DNC is reversible by an agent.
 *
 * Auth: Bearer <Firebase ID token>
 */

async function resolveAgentId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;
  const decoded = await getAdminAuth().verifyIdToken(token);
  return decoded.uid;
}

export async function POST(req: NextRequest) {
  try {
    const agentId = await resolveAgentId(req);
    if (!agentId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json().catch(() => null)) as
      | { phoneE164?: unknown; note?: unknown }
      | null;

    const phoneE164 = normalizePhone(typeof body?.phoneE164 === 'string' ? body.phoneE164 : '');
    if (!isValidE164(phoneE164)) {
      return NextResponse.json({ error: 'Invalid phoneE164' }, { status: 400 });
    }
    const note = typeof body?.note === 'string' && body.note.trim() ? body.note.trim() : null;

    const { wasAlreadySuppressed } = await suppressNumber({
      phoneE164,
      trigger: 'manual',
      sourceLane: 'manual',
      sourceAgentId: agentId,
      rawMessage: note,
    });

    console.log('[compliance:do-not-contact] marked', { agentId, phoneE164, wasAlreadySuppressed });
    return NextResponse.json({ success: true, status: 'suppressed', wasAlreadySuppressed });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[compliance:do-not-contact] POST failed', { error: errMsg });
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const agentId = await resolveAgentId(req);
    if (!agentId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const phoneE164 = normalizePhone(req.nextUrl.searchParams.get('phone') ?? '');
    if (!isValidE164(phoneE164)) {
      return NextResponse.json({ error: 'Invalid phone' }, { status: 400 });
    }

    const status = await getSuppressionStatus(phoneE164);
    if (!status || status.status !== 'suppressed') {
      return NextResponse.json({ success: true, status: status?.status ?? 'not_listed', noop: true });
    }
    // Hard guard: only an agent-set manual DNC is clearable here. A
    // recipient's own STOP / natural-language opt-out must stand.
    if (status.suppressedVia !== 'manual') {
      return NextResponse.json(
        {
          error:
            'This number opted out directly and cannot be cleared by an agent. The recipient must reply START to resume.',
          suppressedVia: status.suppressedVia,
        },
        { status: 409 },
      );
    }

    const { wasSuppressed } = await resubscribeNumber({
      phoneE164,
      sourceLane: 'manual',
      sourceAgentId: agentId,
    });

    console.log('[compliance:do-not-contact] cleared', { agentId, phoneE164, wasSuppressed });
    return NextResponse.json({ success: true, status: 'reactivated', wasSuppressed });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[compliance:do-not-contact] DELETE failed', { error: errMsg });
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
