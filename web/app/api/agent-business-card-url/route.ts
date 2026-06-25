import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '../../../lib/firebase-admin';
import { getBusinessCardUrl } from '../../../lib/business-card-url';

/**
 * GET /api/agent-business-card-url
 *
 * Returns a stable, public URL for the authenticated agent's business
 * card image: `{ url: string | null }`.
 *
 * Used by the confirmation drawer's Android/fallback path: when a
 * device can't attach the card via the Web Share API, we append a
 * tap-to-save link to the SMS body so the lead still gets the card.
 *
 * Delegates to `getBusinessCardUrl`, which uploads the agent's
 * `businessCardBase64` to Firebase Storage once and caches the public
 * URL on the agent doc (`businessCardUrl`) — the same permanent, public
 * media URL already used for MMS attachments in the referral flow.
 *
 * Returns `{ url: null }` (200) when the agent has no business card on
 * file — the caller treats that as "no link to add", not an error.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });

    let decoded;
    try {
      decoded = await getAdminAuth().verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const url = await getBusinessCardUrl(decoded.uid);
    return NextResponse.json({ url: url ?? null });
  } catch (error) {
    console.error('agent-business-card-url error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
