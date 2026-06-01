import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '../../../../lib/firebase-admin';
import { createVideo, getUploadEndpoint } from '../../../../lib/bunny-stream';

type Slot = 'intro' | 'faq' | 'caseStudy';

// Hard cap mirrors the browser-side check in settings/page.tsx. Defense
// in depth — a malicious client could skip the browser cap by hitting
// this endpoint directly. Anything bigger than this for a lead-home
// intro / FAQ / case-study is almost certainly a wrong-file pick.
const MAX_LEAD_VIDEO_BYTES = 1024 * 1024 * 1024; // 1 GB

/**
 * POST /api/lead-content/upload-url
 *
 * Step 1 of the two-step Bunny.net upload flow. Registers a new video
 * on the Bunny library and returns the TUS upload endpoint + signed
 * headers so the browser can stream the file directly to Bunny,
 * bypassing Vercel's 4.5 MB serverless body limit entirely.
 *
 * Nothing is persisted to Firestore yet — the entry only lands on
 * `agents/{agentId}.leadContent.{slot}` after the upload succeeds and
 * the client POSTs to /api/lead-content/commit.
 *
 * Body:
 *   - slot:   'intro' | 'faq' | 'caseStudy'
 *   - slotId: required for faq + caseStudy, ignored for intro
 *   - title:  display title used as the Bunny video title too
 *   - size:   advertised file size in bytes; rejected if > 1 GB
 *
 * Returns:
 *   { videoId, uploadUrl, headers } — feed straight into tus-js-client.
 *
 * Auth: Bearer ID token; agent provisions an upload for their own slot.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    try {
      await getAdminAuth().verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const slot = String(body?.slot || '').trim() as Slot;
    const slotId = String(body?.slotId || '').trim();
    const title = String(body?.title || '').trim().slice(0, 200);
    const size = Number(body?.size);

    if (slot !== 'intro' && slot !== 'faq' && slot !== 'caseStudy') {
      return NextResponse.json({ error: 'Invalid slot' }, { status: 400 });
    }
    if ((slot === 'faq' || slot === 'caseStudy') && !slotId) {
      return NextResponse.json({ error: 'slotId is required for faq + caseStudy' }, { status: 400 });
    }
    if (Number.isFinite(size) && size > MAX_LEAD_VIDEO_BYTES) {
      return NextResponse.json(
        { error: `Video too large (${size} bytes; max 1 GB)` },
        { status: 413 },
      );
    }

    const { videoId } = await createVideo({ title: title || 'Untitled video' });
    const { uploadUrl, headers } = getUploadEndpoint(videoId);

    return NextResponse.json({ videoId, uploadUrl, headers });
  } catch (error) {
    console.error('lead-content/upload-url error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = 'nodejs';
