import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';

/**
 * POST /api/agent-pair/exchange
 *
 * The AFL mobile app calls this with the pairing code it received via
 * deep link after the agent scanned a QR on the dashboard. We trade
 * the code for a Firebase custom token that the app uses to sign in.
 *
 * Why this endpoint is unauthenticated (no Bearer token):
 *   The code IS the bearer credential. The agent gets it by being
 *   signed in on the dashboard at the moment the QR was generated.
 *   Anyone who possesses the code possesses a 5-minute, single-use
 *   ticket to sign in as that agent's phone. That's the design — the
 *   QR is shown only on the agent's screen, scanned only by the agent.
 *
 * Failure modes (all return 400 with a stable error code):
 *   - `invalid-code` — no such doc, or malformed input
 *   - `expired` — expiresAt is in the past
 *   - `already-used` — usedAt is set
 *   - `internal` — something exploded server-side
 *
 * Success returns `{ customToken, agentId }`. The app calls
 * `signInWithCustomToken(auth, customToken)` to complete sign-in.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    if (!code) {
      return NextResponse.json({ error: 'invalid-code' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const codeRef = db.collection('pairingCodes').doc(code);
    const codeSnap = await codeRef.get();
    if (!codeSnap.exists) {
      return NextResponse.json({ error: 'invalid-code' }, { status: 400 });
    }
    const data = codeSnap.data() || {};

    // Expiration check. Firestore Timestamp's toMillis() gives us a
    // wall-clock comparison; we don't trust the client to compute this.
    const expiresAt = data.expiresAt as Timestamp | undefined;
    if (!expiresAt || expiresAt.toMillis() < Date.now()) {
      return NextResponse.json({ error: 'expired' }, { status: 400 });
    }

    // Single-use guard. We atomically mark `usedAt` below; this is the
    // pre-check before the mint. The atomic transaction is the
    // authoritative guard against double-use.
    if (data.usedAt) {
      return NextResponse.json({ error: 'already-used' }, { status: 400 });
    }

    const agentId = data.agentId as string | undefined;
    if (!agentId) {
      return NextResponse.json({ error: 'invalid-code' }, { status: 400 });
    }

    // Atomic: only one caller should win the exchange. Race condition
    // would otherwise let two phones both succeed if they exchanged the
    // same code simultaneously. Use a transaction.
    const won = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(codeRef);
      const freshData = fresh.data() || {};
      if (freshData.usedAt) return false;
      tx.update(codeRef, { usedAt: FieldValue.serverTimestamp() });
      return true;
    });
    if (!won) {
      return NextResponse.json({ error: 'already-used' }, { status: 400 });
    }

    // Mint the custom token. The mobile app passes this to
    // `signInWithCustomToken` and is now signed in as the agent's uid.
    const customToken = await getAdminAuth().createCustomToken(agentId, {
      pairedAt: Date.now(),
      pairedVia: 'qr-pair',
    });

    return NextResponse.json({ customToken, agentId });
  } catch (error) {
    console.error('agent-pair/exchange error:', error);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
