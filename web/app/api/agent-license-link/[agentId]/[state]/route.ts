import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  getLicenseSignedUrl,
  isValidStateCode,
  type StateCode,
} from '../../../../../lib/agent-licenses';

// Don't cache — each hit mints a fresh signed URL.
export const dynamic = 'force-dynamic';

/**
 * GET /api/agent-license-link/[agentId]/[state]  — PUBLIC (no auth)
 *
 * 302-redirects to a freshly-minted signed URL for the agent's license
 * PDF/image in [state]. This is the short, lead-tappable link appended
 * to a booking confirmation's text when the device can't attach files.
 * It MUST be public — the lead who taps it isn't logged in.
 *
 * Kept short (`/api/agent-license-link/{uid}/{ST}`) so it doesn't bloat
 * the SMS body — a raw 365-day signed URL is ~700 chars and could
 * truncate the confirmation text. Exposure equals texting the signed URL
 * directly (the lead must be able to open it without auth); this just
 * makes the link short. Returns 404 when there's no license for that
 * state — the client only appends this when one exists, so that's
 * defensive.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ agentId: string; state: string }> },
) {
  try {
    const { agentId, state } = await context.params;
    const stateCode = (state || '').toUpperCase();
    if (!agentId || !isValidStateCode(stateCode)) {
      return new NextResponse('Not found', { status: 404 });
    }

    const result = await getLicenseSignedUrl(agentId, stateCode as StateCode);
    if (!result) return new NextResponse('Not found', { status: 404 });

    return NextResponse.redirect(result.url, 302);
  } catch (error) {
    console.error('agent-license-link error:', error);
    return new NextResponse('Server error', { status: 500 });
  }
}
