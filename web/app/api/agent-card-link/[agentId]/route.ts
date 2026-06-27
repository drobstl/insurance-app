import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getBusinessCardUrl } from '../../../../lib/business-card-url';

// Don't cache the redirect — the underlying card URL is resolved per request.
export const dynamic = 'force-dynamic';

/**
 * GET /api/agent-card-link/[agentId]  — PUBLIC (no auth)
 *
 * 302-redirects to the agent's business card image. This is the short,
 * lead-tappable link appended to a booking confirmation's text when the
 * device can't attach files (Android fallback). It MUST be public — the
 * lead who taps it isn't logged in.
 *
 * Kept deliberately short (`/api/agent-card-link/{uid}`) so it never
 * bloats the SMS body and push the confirmation text out of it. The
 * business card is already a public asset (the same `getBusinessCardUrl`
 * value is used as MMS media in the referral flow), so this adds no new
 * exposure. Returns 404 when the agent has no card on file — the client
 * only ever appends this link when the card exists, so that's defensive.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    const { agentId } = await context.params;
    if (!agentId) return new NextResponse('Not found', { status: 404 });

    const url = await getBusinessCardUrl(agentId);
    if (!url) return new NextResponse('Not found', { status: 404 });

    return NextResponse.redirect(url, 302);
  } catch (error) {
    console.error('agent-card-link error:', error);
    return new NextResponse('Server error', { status: 500 });
  }
}
