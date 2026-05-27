import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';

/**
 * POST /api/agent-pair/mint
 *
 * Creates a one-time pairing code that the agent's phone will exchange
 * for a Firebase custom auth token. Issued to the signed-in agent
 * holding a valid Firebase ID token; the phone never sees this endpoint
 * — only the website does, when the agent clicks "Set up my phone".
 *
 * Flow:
 *   1. Website (signed-in agent) calls this endpoint.
 *   2. We mint a random 32-byte code, store it at
 *      `pairingCodes/{code}` tied to the agent's uid with a 5-minute
 *      expiration.
 *   3. Website renders a QR encoding `https://agentforlife.app/pair/{code}`.
 *   4. Agent scans with iPhone Camera, opens the redirect page,
 *      which bounces to `agentforlife://pair/{code}`.
 *   5. AFL app catches the deep link, calls
 *      `/api/agent-pair/exchange` with the code to receive a custom
 *      token, signs in with that token.
 *
 * Security notes:
 *   - Codes are single-use. The exchange endpoint marks the doc
 *     `usedAt` and refuses re-exchange.
 *   - Codes expire after 5 minutes. Long enough to scan, short enough
 *     that a leaked QR screenshot is mostly harmless after the meeting.
 *   - The code itself is the bearer credential for the exchange step,
 *     so it must come from a secure entropy source (crypto.randomBytes).
 *   - The mint endpoint requires the agent to own an
 *     `agents/{uid}` document — anyone with a valid Firebase token in
 *     this project could otherwise call it, even non-agent accounts.
 */

const CODE_LENGTH_BYTES = 32; // → 64 hex chars
const CODE_TTL_SECONDS = 5 * 60;

export async function POST(req: NextRequest) {
  try {
    // ── Auth: require a signed-in agent ──
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }
    let decoded;
    try {
      decoded = await getAdminAuth().verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }
    const agentId = decoded.uid;

    const db = getAdminFirestore();

    // Confirm this uid actually corresponds to an agent. Defensive:
    // every signed-in dashboard user *should* be an agent, but the
    // pairing flow grants a custom token that signs into the mobile
    // app — we don't want a non-agent uid grabbing one of those.
    const agentSnap = await db.collection('agents').doc(agentId).get();
    if (!agentSnap.exists) {
      return NextResponse.json({ error: 'Agent profile not found' }, { status: 403 });
    }

    // ── Mint the code ──
    const code = randomBytes(CODE_LENGTH_BYTES).toString('hex');
    const now = Date.now();
    const expiresAt = Timestamp.fromMillis(now + CODE_TTL_SECONDS * 1000);

    await db.collection('pairingCodes').doc(code).set({
      agentId,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
      usedAt: null,
    });

    return NextResponse.json({
      code,
      expiresAtMs: expiresAt.toMillis(),
      ttlSeconds: CODE_TTL_SECONDS,
    });
  } catch (error) {
    console.error('agent-pair/mint error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
