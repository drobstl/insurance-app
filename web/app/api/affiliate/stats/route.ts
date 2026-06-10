import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import {
  FirstPromoterApiError,
  getPromoterEarningsSummary,
  isFirstPromoterConfigured,
} from '../../../../lib/firstpromoter';

/**
 * GET /api/affiliate/stats
 *
 * Read-only. Returns the calling agent's affiliate earnings summary
 * (owed / pending / paid / lifetime), computed from their FirstPromoter
 * commissions, so the Refer & Earn page can show the money in-app
 * without the agent ever logging into FirstPromoter.
 *
 * Auth: Bearer <Firebase ID token>
 *
 * Responses:
 *   200 { enrolled: false }                          — no promoter yet
 *   200 { enrolled: true, owedCents, pendingCents, paidCents, earnedCents, ... }
 *   503 { error: 'affiliate_program_unavailable' }   — FP not configured
 *   401 / 502 / 500                                  — auth / upstream / unknown
 */
export async function GET(req: NextRequest) {
  try {
    // --- 1. Auth ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = await getAdminAuth().verifyIdToken(token);
    const agentId = decoded.uid;

    // --- 2. Bail early if FP isn't configured (same contract as create) ---
    if (!isFirstPromoterConfigured()) {
      return NextResponse.json(
        { error: 'affiliate_program_unavailable' },
        { status: 503 },
      );
    }

    // --- 3. Find the agent's promoter id ---
    const db = getAdminFirestore();
    const agentSnap = await db.collection('agents').doc(agentId).get();
    const affiliate = agentSnap.exists
      ? (agentSnap.data() as { affiliate?: { firstPromoterPromoterId?: number } } | undefined)
          ?.affiliate
      : undefined;
    const promoterId = affiliate?.firstPromoterPromoterId;
    if (!promoterId) {
      return NextResponse.json({ enrolled: false });
    }

    // --- 4. Summarize commissions ---
    const summary = await getPromoterEarningsSummary(promoterId);
    return NextResponse.json({ enrolled: true, ...summary });
  } catch (error) {
    if (error instanceof FirstPromoterApiError) {
      console.error('[affiliate/stats] FirstPromoter API error', {
        status: error.status,
        code: error.code,
        message: error.message,
      });
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status >= 400 && error.status < 600 ? error.status : 502 },
      );
    }
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[affiliate/stats] unexpected error', { error: errMsg });
    if (errMsg.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
