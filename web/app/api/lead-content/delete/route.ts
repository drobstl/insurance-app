import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '../../../../lib/firebase-admin';
import { deleteVideo as deleteBunnyVideo } from '../../../../lib/bunny-stream';

type Slot = 'intro' | 'faq' | 'caseStudy';

/**
 * POST /api/lead-content/delete
 *
 * Remove a lead-home video. Body: { slot, slotId? }.
 *
 *   - slot='intro': clears `leadContent.intro` and deletes the Bunny video.
 *   - slot='faq'/'caseStudy' + slotId: removes that array entry and its
 *     Bunny video.
 *
 * Bunny delete failures are logged but swallowed — the Firestore entry
 * still gets removed so the UI / mobile reflect the deletion. A leftover
 * orphan video in Bunny is recoverable (deleteVideo is idempotent and we
 * can replay), but a stuck UI entry is not.
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
    if (slot !== 'intro' && slot !== 'faq' && slot !== 'caseStudy') {
      return NextResponse.json({ error: 'Invalid slot' }, { status: 400 });
    }
    if ((slot === 'faq' || slot === 'caseStudy') && !slotId) {
      return NextResponse.json({ error: 'slotId required' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const agentRef = db.collection('agents').doc(agentId);
    const snap = await agentRef.get();
    const leadContent = (snap.data()?.leadContent || {}) as Record<string, unknown>;

    if (slot === 'intro') {
      const intro = leadContent.intro as { videoId?: string } | undefined;
      if (intro?.videoId) {
        try {
          await deleteBunnyVideo(intro.videoId);
        } catch (err) {
          console.warn('Bunny delete failed (intro):', err);
        }
      }
      await agentRef.set({ leadContent: { intro: FieldValue.delete() } }, { merge: true });
      return NextResponse.json({ ok: true });
    }

    const arrKey: 'faqs' | 'caseStudies' = slot === 'faq' ? 'faqs' : 'caseStudies';
    const arr = Array.isArray(leadContent[arrKey])
      ? [...(leadContent[arrKey] as Array<Record<string, unknown>>)]
      : [];
    const targetIdx = arr.findIndex((e) => e?.id === slotId);
    if (targetIdx >= 0) {
      const target = arr[targetIdx];
      const videoId = typeof target?.videoId === 'string' ? target.videoId : '';
      if (videoId) {
        try {
          await deleteBunnyVideo(videoId);
        } catch (err) {
          console.warn(`Bunny delete failed (${arrKey}/${slotId}):`, err);
        }
      }
      arr.splice(targetIdx, 1);
    }
    await agentRef.set({ leadContent: { [arrKey]: arr } }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('lead-content/delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const runtime = 'nodejs';
