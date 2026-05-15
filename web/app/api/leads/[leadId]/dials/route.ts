import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../../lib/firebase-admin';

/**
 * Dial outcome taxonomy. Locked vocabulary so we can build queue-priority
 * heuristics + reporting on top later. Adding values is fine; renaming
 * existing ones requires a Firestore migration since they're persisted
 * as strings on the lead doc.
 */
const VALID_OUTCOMES = [
  'no_answer',
  'left_vm',
  'wrong_number',
  'not_interested',
  'callback_requested',
  'booked',
  // Lead explicitly asked not to be contacted again. Treated like
  // wrong_number / not_interested in the queue filter — never resurfaces
  // automatically. Agent can still see the lead, but they shouldn't dial.
  'do_not_call',
] as const;
type DialOutcome = typeof VALID_OUTCOMES[number];

interface DialEntry {
  at: Timestamp;
  outcome: DialOutcome;
  notes?: string;
}

/**
 * POST /api/leads/[leadId]/dials
 *
 * Append a dial outcome to the lead's `dialLog` array. The agent has
 * already tap-to-called via the `tel:` deep link on the dashboard;
 * this endpoint just records what happened.
 *
 * Storing as an array (vs subcollection) because realistic max ~50
 * dials per lead × ~50 bytes each ≈ 2.5 KB doc bloat — well under
 * Firestore's 1 MiB doc cap. Array makes "next-up-to-dial" queue
 * queries cheap (no per-lead extra reads).
 *
 * Auth: Bearer ID token, agent must own the lead. The `agentId` is
 * taken from the authenticated user.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ leadId: string }> },
) {
  try {
    const { leadId } = await context.params;
    if (!leadId) {
      return NextResponse.json({ error: 'Missing leadId' }, { status: 400 });
    }

    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    let decoded;
    try {
      decoded = await getAdminAuth().verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }
    const agentId = decoded.uid;

    const body = await req.json().catch(() => ({}));
    const outcome = typeof body?.outcome === 'string' ? body.outcome.trim() : '';
    const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 500) : '';

    if (!VALID_OUTCOMES.includes(outcome as DialOutcome)) {
      return NextResponse.json(
        { error: `Invalid outcome. Must be one of: ${VALID_OUTCOMES.join(', ')}` },
        { status: 400 },
      );
    }

    const db = getAdminFirestore();
    const leadRef = db.collection('agents').doc(agentId).collection('leads').doc(leadId);
    const snap = await leadRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Build the entry. arrayUnion would be ideal but it can't compare
    // documents with serverTimestamp; we materialize a JS Date inline
    // so the array op is deterministic. The clock skew is bounded by
    // the agent's device — acceptable for dial timestamps.
    const entry: DialEntry = {
      at: Timestamp.now(),
      outcome: outcome as DialOutcome,
      ...(notes ? { notes } : {}),
    };

    await leadRef.update({
      dialLog: FieldValue.arrayUnion(entry),
      lastDialAt: entry.at,
      lastDialOutcome: entry.outcome,
    });

    return NextResponse.json({ ok: true, entry });
  } catch (error) {
    console.error('leads/dials error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
