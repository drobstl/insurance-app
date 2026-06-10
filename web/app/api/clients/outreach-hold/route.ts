import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';

/**
 * Per-agent "automated outreach hold" toggle.
 *
 * When `automatedOutreachHold: true` is set on the agent doc, the
 * whole-book care crons (birthday, holiday, beneficiary, policy-review,
 * policy-review-drip, conservation-outreach) skip this agent — see
 * `isClientOutreachPaused` in lib/tier-gating.ts. The hold is the safety
 * net for a freshly-imported, un-reviewed book: nothing automated reaches
 * a client until the agent has cleaned up duplicates / denied applications
 * and releases it.
 *
 *   GET    → { held, reason, heldAt, releasedAt }
 *   POST   { action: 'hold' | 'release', reason? } → set / clear the flag
 *
 * Auth: Bearer ID token. Scoped to the calling agent's own doc.
 */

async function authAgentId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;
  try {
    return (await getAdminAuth().verifyIdToken(token)).uid;
  } catch {
    return null;
  }
}

function toMillis(v: unknown): number | null {
  if (v && typeof (v as { toMillis?: () => number }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  return null;
}

export async function GET(req: NextRequest) {
  const agentId = await authAgentId(req);
  if (!agentId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const snap = await getAdminFirestore().collection('agents').doc(agentId).get();
  const data = snap.data() || {};
  return NextResponse.json({
    held: data.automatedOutreachHold === true,
    reason: typeof data.automatedOutreachHoldReason === 'string' ? data.automatedOutreachHoldReason : null,
    heldAt: toMillis(data.automatedOutreachHeldAt),
    releasedAt: toMillis(data.automatedOutreachHoldReleasedAt),
  });
}

export async function POST(req: NextRequest) {
  const agentId = await authAgentId(req);
  if (!agentId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { action?: string; reason?: string };
  const action = body?.action === 'hold' ? 'hold' : 'release';
  const ref = getAdminFirestore().collection('agents').doc(agentId);

  if (action === 'hold') {
    await ref.set(
      {
        automatedOutreachHold: true,
        automatedOutreachHoldReason: typeof body?.reason === 'string' ? body.reason : 'manual',
        automatedOutreachHeldAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } else {
    await ref.set(
      {
        automatedOutreachHold: false,
        automatedOutreachHoldReleasedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  return NextResponse.json({ ok: true, held: action === 'hold' });
}
