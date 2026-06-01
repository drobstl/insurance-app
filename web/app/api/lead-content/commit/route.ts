import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { getStreamUrls } from '../../../../lib/bunny-stream';

type Slot = 'intro' | 'faq' | 'caseStudy';

// Persisted shape per slot. `id` is only set for faq + caseStudy array entries
// (intro is a single object on the agent doc, no id needed).
//   - url:          HLS .m3u8 — what mobile expo-video plays.
//   - iframeUrl:    Embed iframe — fallback if the HLS path ever breaks.
//   - thumbnailUrl: Poster image for the tile in lead-home.
//   - videoId:      Bunny GUID — needed for delete.

/**
 * POST /api/lead-content/commit
 *
 * Step 2 of the two-step Bunny.net upload flow. The browser has just
 * finished pushing the file to Bunny via TUS; we now derive the public
 * stream URLs from the video GUID and persist them on the agent doc so
 * the mobile lead-home picks them up.
 *
 * Body:
 *   - slot:    'intro' | 'faq' | 'caseStudy'
 *   - slotId:  required for faq + caseStudy
 *   - title:   display title
 *   - videoId: Bunny GUID returned from /upload-url
 *
 * Auth: Bearer ID token; agent commits their own upload.
 */
export async function POST(req: NextRequest) {
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
    const agentId = decoded.uid;

    const body = await req.json().catch(() => ({}));
    const slot = String(body?.slot || '').trim() as Slot;
    const slotId = String(body?.slotId || '').trim();
    const title = String(body?.title || '').trim().slice(0, 200);
    const videoId = String(body?.videoId || '').trim();

    if (slot !== 'intro' && slot !== 'faq' && slot !== 'caseStudy') {
      return NextResponse.json({ error: 'Invalid slot' }, { status: 400 });
    }
    if ((slot === 'faq' || slot === 'caseStudy') && !slotId) {
      return NextResponse.json({ error: 'slotId is required for faq + caseStudy' }, { status: 400 });
    }
    if (!videoId) {
      return NextResponse.json({ error: 'videoId required' }, { status: 400 });
    }

    const { hlsUrl, iframeUrl, thumbnailUrl } = getStreamUrls(videoId);

    const db = getAdminFirestore();
    const agentRef = db.collection('agents').doc(agentId);

    if (slot === 'intro') {
      const entry = {
        title: title || 'Welcome — what to do next',
        url: hlsUrl,
        iframeUrl,
        thumbnailUrl,
        videoId,
        updatedAt: new Date().toISOString(),
      };
      await agentRef.set({ leadContent: { intro: entry } }, { merge: true });
      return NextResponse.json({ slot, entry });
    }

    // faq / caseStudy: array upsert by slotId.
    const snap = await agentRef.get();
    const existing = (snap.data()?.leadContent || {}) as Record<string, unknown>;
    const arrKey: 'faqs' | 'caseStudies' = slot === 'faq' ? 'faqs' : 'caseStudies';
    const arr = Array.isArray(existing[arrKey])
      ? [...(existing[arrKey] as Array<Record<string, unknown>>)]
      : [];
    const idx = arr.findIndex((e) => e?.id === slotId);
    const entry = {
      id: slotId,
      title: title || 'Untitled video',
      url: hlsUrl,
      iframeUrl,
      thumbnailUrl,
      videoId,
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) arr[idx] = entry; else arr.push(entry);

    await agentRef.set({ leadContent: { [arrKey]: arr } }, { merge: true });
    return NextResponse.json({ slot, slotId, entry });
  } catch (error) {
    console.error('lead-content/commit error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const runtime = 'nodejs';
